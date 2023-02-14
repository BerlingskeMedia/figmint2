import * as Figma from 'figma-js'
import fs from 'fs'
import prettier from 'prettier'
import { exportFormatOptions } from 'figma-js'
import camelCase from 'camelcase'
import {
  FigmintGradient,
  BaseTypeStyleType,
  BaseEffectStyleType,
  FigmintExportType,
  FigmintFillStyleType,
  FigmintTypeStyleType,
} from '../utils/types'
import { fetchImageUrls } from './images'
import { getStylesFromFile } from './style'
import { DownloadListType } from './types'
import { writeStylesToFile } from './write-file'

export interface FetchData {
  client: Figma.ClientInterface
  file: string
  output: string
  setFileName?: (fileName: string) => void
  setLoading?: (loading: boolean) => void
  setFills?: (fills: FigmintFillStyleType[]) => void
  setTypography?: (typography: FigmintTypeStyleType[]) => void
  setExports?: (exports: FigmintExportType) => void
  typescript?: boolean
}

export const fetchData = async ({
  client,
  file,
  output,
  setFileName,
  setLoading,
  // set our local state
  setFills,
  setTypography,
  setExports,
  typescript,
}: FetchData): Promise<void> => {
  if (!client || !file) return
  const [fileResponse, imageFillsResponse] = await Promise.all([
    client.file(file),
    client.fileImageFills(file),
  ])

  setFileName && setFileName(fileResponse.data.name)

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

  const finalExports: any = {} // ) FinalExportsType = {}

  const downloadLists: DownloadListType = {}

  // first we look at all the various exports found in the file.
  // We need to note the scale and format so we can ask for images
  // of the right type and format from the figma API.

  Object.entries(exports).forEach(([id, info]) => {
    info.exportInfo.forEach((image: any) => {
      const name = info.name
      const group = info.folder
      const page = info.page
      const format = image.format.toLowerCase() as exportFormatOptions
      const scale =
        image.constraint.type === 'SCALE' ? image.constraint.value : 1

      const imageDetails = {
        id,
        format,
        page,
        group,
        name,
        scale,
      }

      if (!(page in finalExports)) {
        finalExports[page] = {}
      }

      if (!(name in finalExports[page])) {
        finalExports[page][name] = {}
      }

      // vector images don't have a scale
      if (format === 'svg' || format === 'pdf') {
        finalExports[page][name][format] = imageDetails

        if (!(format in downloadLists)) {
          downloadLists[format] = []
        }

        downloadLists[format].push(imageDetails)
      } else if (format === 'png' || format === 'jpg') {
        if (!(format in finalExports[page][name])) {
          finalExports[page][name][format] = {}
        }
        finalExports[page][name][format]![scale] = imageDetails

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

  styles.exports = (await fetchImageUrls({
    client,
    file,
    output,
    downloadLists,
    finalExports,
  })) as FigmintExportType

  // write out our file

  let colors = {} as { [colorName: string]: string }
  let gradients = {} as { [gradientName: string]: FigmintGradient }
  let imageFills = {} as { [imageFillName: string]: string }
  let textStyles = {} as { [name: string]: BaseTypeStyleType }
  let effectStyles = {} as { [name: string]: BaseEffectStyleType }

  styles.fillStyles.forEach((fill) => {
    fill.styles.forEach((style: any) => {
      switch (style.type) {
        case 'SOLID':
          colors[camelCase(fill.name)] = style.color
          break
        case 'GRADIENT_LINEAR':
        case 'GRADIENT_RADIAL':
        case 'GRADIENT_ANGULAR':
        case 'GRADIENT_DIAMOND':
          gradients[camelCase(fill.name)] = style
          break
        case 'IMAGE':
          imageFills[camelCase(fill.name)] = style.fileName
      }
    })
  })

  styles.textStyles.forEach((text) => {
    textStyles[camelCase(text.name)] = text.styles
  })

  styles.effectStyles.forEach((effect) => {
    effectStyles[camelCase(effect.name)] = effect.styles
  })

  const options = await prettier.resolveConfig(output)

  writeStylesToFile({
    typescript,
    options,
    output,
    colors,
    gradients,
    imageFills,
    textStyles,
    effectStyles,
    styles,
  })

  setLoading && setLoading(false)

  // set our local state
  setFills && setFills(styles.fillStyles)
  setTypography && setTypography(styles.textStyles)
  setExports && setExports(styles.exports)
}
