import React from 'react'
import useInterval from 'use-interval'

import * as Figma from 'figma-js'

import cosmiconfig from 'cosmiconfig'

import fs from 'fs'
import path from 'path'
import util from 'util'

import { Text, Box, Color, render } from 'ink'

import { StyleFill } from './StyleFill'
import { StyleText } from './StyleText'

import { Frame } from './Frame'
import { ErrorBox } from './Error'

import {
  getStylesFromFile,
  FigmintFillStyleType,
  FigmintTypeStyleType,
  FigmintExportType,
  downloadImage,
  PartialFigmintExportType,
} from './utils'
import { exportFormatOptions } from 'figma-js'
import { StyleExport } from './StyleExport'

// export our types for clients to use
export * from './utils/types'

// clear the console
process.stdout.write('\x1Bc')

// Local Types
type DownloadListType = {
  [formatScale: string]: PartialFigmintExportType[]
}

type FinalExportsType = {
  [group: string]: {
    [fileName: string]: {
      svg?: PartialFigmintExportType
      pdf?: PartialFigmintExportType
      png?: {
        [scale: number]: PartialFigmintExportType
      }
      jpg?: {
        [scale: number]: PartialFigmintExportType
      }
    }
  }
}

// Components

const Header = ({ text }: { text: string }) => (
  <Color gray>
    <Box marginBottom={1}>
      <Text bold>{text}:</Text>
    </Box>
  </Color>
)

const Output = () => {
  // 📝 State
  // --------

  // Config
  const [token, setToken] = React.useState('')
  const [file, setFile] = React.useState('')
  const [output, setOutput] = React.useState('figmaStyles')
  const [typescript, setTypescript] = React.useState(false)

  // Data from Figma
  const [fileName, setFileName] = React.useState('')
  const [fills, setFills] = React.useState<FigmintFillStyleType[]>([])
  const [typography, setTypography] = React.useState<FigmintTypeStyleType[]>([])
  const [exports, setExports] = React.useState<FigmintExportType>()

  // Internal State
  const [loading, setLoading] = React.useState(true)
  const [hasConfig, setHasConfig] = React.useState(false)
  const [watching] = React.useState(process.argv.slice(2)[0] === 'watch')
  const [client, setClient] = React.useState<Figma.ClientInterface>()

  // Function to get an image URL from figma given some params

  const fetchAndAddImageUrls = React.useCallback(
    async (downloadLists: DownloadListType, finalExports: FinalExportsType) => {
      if (client && file) {
        await Promise.all(
          Object.keys(downloadLists).map(async (format) => {
            if (downloadLists[format].length > 0) {
              let imageResponse

              // first we get the image urls from figma based on format and scale
              if (format === 'svg' || format === 'pdf') {
                imageResponse = await client.fileImages(file, {
                  format,
                  ids: downloadLists[format].map((image) => image.id),
                })
              } else {
                imageResponse = await client.fileImages(file, {
                  format: downloadLists[format][0].format,
                  scale: downloadLists[format][0].scale,
                  ids: downloadLists[format].map((image) => image.id),
                })
              }

              // next we use these urls to download the images and add the url and file info to our exports object
              Object.entries(imageResponse.data.images).forEach(([id, url]) => {
                const image = downloadLists[format].find(
                  (image) => image.id === id,
                )

                if (image) {
                  // store images based on group
                  const outDirectory = path.join(output, 'exports', image.group)

                  // image file name based on format and scale
                  const outFile = `${image.name}${
                    image.scale > 1 ? `@${image.scale}x` : ''
                  }.${image.format}`

                  const outUrl = path.join(outDirectory, outFile)

                  // make sure the directory for this image exists directory exists
                  if (!fs.existsSync(outDirectory)) {
                    fs.mkdirSync(outDirectory, { recursive: true })
                  }

                  downloadImage(url, outUrl)

                  if (image.format === 'png' || image.format === 'jpg') {
                    finalExports[image.group][image.name][image.format]![
                      image.scale
                    ] = {
                      ...finalExports[image.group][image.name][image.format]![
                        image.scale
                      ],
                      url: outUrl,
                      directory: outDirectory,
                      file: outFile,
                    }
                  } else {
                    finalExports[image.group][image.name][image.format] = {
                      ...finalExports[image.group][image.name][image.format]!,
                      url: outUrl,
                      directory: outDirectory,
                      file: outFile,
                    }
                  }
                }
              })
            }
          }),
        )

        return finalExports
      }
      throw new Error('client and file needed to run this function')
    },
    [client, file, output],
  )

  // const addImageUrlsToExport = React.useCallback(
  //   async (exports: PartialFigmintExportType[]) => {
  //     if (client && file) {
  //       const exportsByType: { [key: string]: PartialFigmintExportType[] } = {
  //         jpg: [],
  //         svg: [],
  //         png: [],
  //         pdf: [],
  //       }
  //
  //       Object.keys(exportsByType).forEach((key) => {
  //         exportsByType[key] = exports.filter((image) => {
  //           return image.format === key
  //         })
  //       })
  //
  //       const imageResponse = await client.fileImages(file, {
  //         ...image,
  //         ids: [image.id],
  //       })
  //
  //       return { ...image, url: imageResponse.data.images[image.id] }
  //     }
  //     throw new Error('client and file needed to run this function')
  //   },
  //   [client, file],
  // )

  // 📡 Function to connect to Figma and get the data we need
  // --------------------------------------------------------

  const fetchData = React.useCallback(async () => {
    if (client && file) {
      const [fileResponse, imageFillsResponse] = await Promise.all([
        client.file(file),
        client.fileImageFills(file),
      ])

      setFileName(fileResponse.data.name)

      // Make sure the output directory exists
      if (!fs.existsSync(output)) {
        fs.mkdirSync(output, { recursive: true })
      }

      // combine the style meta data with the actual style info
      const { styles, exports } = await getStylesFromFile(
        fileResponse.data,
        imageFillsResponse.data,
        output,
      )

      // 🖼 time to get export images!

      const finalExports: FinalExportsType = {}

      const downloadLists: DownloadListType = {}

      // first we look at all the various exports found in the file.
      // We need to note the scale and format so we can ask for images
      // of the right type and format from the figma API.

      Object.entries(exports).forEach(([id, info]) => {
        info.exportInfo.forEach((image) => {
          const name = info.name
          const group = info.folder
          const format = image.format.toLowerCase() as exportFormatOptions
          const scale =
            image.constraint.type === 'SCALE' ? image.constraint.value : 1

          const imageDetails = {
            id,
            format,
            group,
            name,
            scale,
          }

          if (!(group in finalExports)) {
            finalExports[group] = {}
          }

          if (!(name in finalExports[group])) {
            finalExports[group][name] = {}
          }

          // vector images don't have a scale
          if (format === 'svg' || format === 'pdf') {
            finalExports[group][name][format] = imageDetails

            if (!(format in downloadLists)) {
              downloadLists[format] = []
            }

            downloadLists[format].push(imageDetails)
          } else if (format === 'png' || format === 'jpg') {
            if (!(format in finalExports[group][name])) {
              finalExports[group][name][format] = {}
            }
            finalExports[group][name][format]![scale] = imageDetails

            const formatScale = format + `@${scale}x`

            if (!(formatScale in downloadLists)) {
              downloadLists[formatScale] = []
            }

            downloadLists[formatScale].push(imageDetails)
          }
        })
      })

      // Once we know everything we need about our exports we fetch the image URL's from figma
      // we group these by file type to reduce the number of requests.

      styles.exports = (await fetchAndAddImageUrls(
        downloadLists,
        finalExports,
      )) as FigmintExportType

      // write out our file

      let solidColors = ''
      let fillNames = ''
      let textNames = ''

      styles.fillStyles.forEach((fill) => {
        fillNames += `| '${fill.name}'`
        fill.styles.forEach((style) => {
          if (style.type === 'SOLID') {
            solidColors += `| '${style.color}'`
          }
        })
      })

      styles.textStyles.forEach((text) => {
        textNames += `| '${text.name}'`
      })

      fs.writeFileSync(
        path.join(output, `index.${typescript ? 'ts' : 'js'}`),
        `
        ${typescript ? `import { FigmintOutput } from 'figmint'` : ''}

        const styles${typescript ? ': FigmintOutput' : ''} = ${util.inspect(
          styles,
          {
            depth: Infinity,
            compact: false,
          },
        )}

        ${
          typescript
            ? `
          ${
            solidColors !== '' ? `export type SolidColors = ${solidColors}` : ''
          }
          ${fillNames !== '' ? `export type FillNames = ${fillNames}` : ''}
          ${textNames !== '' ? `export type TextNames = ${textNames}` : ''}
          `
            : ''
        }

        export default styles`,
      )

      setLoading(false)

      // set our local state
      setFills(styles.fillStyles)
      setTypography(styles.textStyles)
      setExports(styles.exports)
    }
  }, [client, fetchAndAddImageUrls, file, output, typescript])

  // ⚓️ Hooks!
  // ---------

  // 🛠 Initial Setup
  React.useEffect(() => {
    const explorer = cosmiconfig('figmint')

    const configResult = explorer.searchSync()

    if (configResult) {
      setHasConfig(true)

      if ('token' in configResult.config) {
        setToken(configResult.config.token)
      }

      if ('file' in configResult.config) {
        setFile(configResult.config.file)
      }

      if ('output' in configResult.config) {
        setOutput(configResult.config.output)
      }

      if ('typescript' in configResult.config) {
        setTypescript(configResult.config.typescript)
      }
    }

    if (token) {
      setClient(
        Figma.Client({
          personalAccessToken: token,
        }),
      )
    }
  }, [token, file])

  // 🐶 Initial data fetch
  React.useEffect(() => {
    const fetch = async () => {
      fetchData()
    }
    fetch()
  }, [client, fetchData])

  // 👀 if we're watching, keep fetching
  useInterval(fetchData, watching ? 1000 : null)

  // ⚠️ Error Handling
  // -----------------

  if (!hasConfig) {
    return (
      <Frame>
        <ErrorBox>
          Figmint requires a config.
          (https://github.com/tiltshift/figmint#config)
        </ErrorBox>
      </Frame>
    )
  }

  if (!client) {
    return (
      <Frame>
        <ErrorBox>
          Figma Token is required. (https://github.com/tiltshift/figmint#token)
        </ErrorBox>
      </Frame>
    )
  }

  if (!file) {
    return (
      <Frame>
        <ErrorBox>
          Figma File is required. (https://github.com/tiltshift/figmint#file)
        </ErrorBox>
      </Frame>
    )
  }

  // 🍃 The App
  // ----------

  return (
    <Frame loading={loading} watching={watching} fileName={fileName}>
      <Box flexDirection="row">
        <Box flexDirection="column">
          <Header text="Fill Styles" />
          {fills.map((fill) => (
            <StyleFill key={fill.key} fill={fill} />
          ))}
        </Box>
        <Box flexDirection="column">
          <Header text="Text Styles" />
          {typography.map((text) => (
            <StyleText key={text.key} text={text} />
          ))}
        </Box>
        <Box flexDirection="column">
          <Header text="Exports" />
          {exports.map((file) => (
            <StyleExport key={file.url} image={file} />
          ))}
        </Box>
      </Box>
    </Frame>
  )
}

render(<Output />, { debug: true })
