import * as Figma from 'figma-js'
import util from 'util'
import fs from 'fs'
import path from 'path'
import rimraf from 'rimraf'
import prettier from 'prettier'
import { exportFormatOptions } from 'figma-js'
import camelCase from 'camelcase'
import { downloadFillImage, figmaToJson } from '../utils'
import {
  RawStyleObject,
  RawStyleType,
  ExportsObject,
  PartialFigmintExportType,
  FigmintGradient,
  BaseTypeStyleType,
  BaseEffectStyleType,
  FigmintExportType,
} from '../utils/types'
import { fetchImageUrls } from './images'

type DownloadListType = {
  [formatScale: string]: PartialFigmintExportType[]
}

type FinalExportsType = {
  [page: string]: {
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

// work through the node and its children to attach all style definitions to the style types
const findStyleInNode = (
  keysToFind: string[],
  node: Figma.Node,
  canvas?: Figma.Canvas,
  parent?: Figma.Node,
  styles: RawStyleObject = {},
  exports: ExportsObject = {},
) => {
  let finalStyles = styles
  let finalExports = exports

  let canvasNode: Figma.Canvas | undefined = canvas

  if (node.type === 'CANVAS') canvasNode = node

  if (
    'exportSettings' in node &&
    node.exportSettings !== undefined &&
    node.exportSettings.length > 0
  ) {
    finalExports[node.id] = {
      exportInfo: node.exportSettings,
      name: node.name,
      page: canvas ? canvas.name : 'undefined',
      folder: parent ? parent.name : 'ungrouped',
    }
  }
  if ('styles' in node && node.styles !== undefined) {
    Object.entries(node.styles).forEach(([styleType, key]: any) => {
      if (!(key in styles)) {
        finalStyles[key] = {} as RawStyleType

        const setStyleProps = ({ styles, key, props }: any) => {
          if (!styles[key]) return
          styles[key].props = props
        }

        switch (styleType) {
          case 'text':
            if ('style' in node) {
              setStyleProps({ styles, key, props: node.style })
            }
            break
          case 'grid':
            if ('layoutGrids' in node && node.layoutGrids !== undefined) {
              setStyleProps({ styles, key, props: node.layoutGrids })
            }
            break
          case 'background':
            if ('background' in node) {
              setStyleProps({ styles, key, props: node.background })
            }
            break
          case 'stroke':
            if ('strokes' in node) {
              setStyleProps({ styles, key, props: node.strokes })
            }
            break
          case 'fill':
            if ('fills' in node) {
              setStyleProps({ styles, key, props: node.fills })
            }
            break
          case 'effect':
            if ('effects' in node) {
              setStyleProps({ styles, key, props: node.effects })
              styles[key].props = node.effects
            }
        }
      }
    })
  }

  if ('children' in node) {
    node.children.forEach((child: any) => {
      const { styles: childStyles, exports: childExports } = findStyleInNode(
        keysToFind,
        child,
        canvasNode,
        node,
        styles,
        finalExports,
      )
      finalStyles = {
        ...finalStyles,
        ...childStyles,
      }
      finalExports = {
        ...finalExports,
        ...childExports,
      }
    })
  }

  return { styles: finalStyles, exports: finalExports }
}

export const getStylesFromFile = async (
  file: Figma.FileResponse,
  imageFills: Figma.FileImageFillsResponse,
  output: string,
) => {
  const styleDefinitions = Object.keys(file.styles)

  const { styles: styleValues, exports } = findStyleInNode(
    styleDefinitions,
    file.document,
  )

  let fileName: string | undefined

  // download fill images

  const outputDir = path.join(output, 'fillImages')

  // Clear out the output dir if it already exists
  if (fs.existsSync(outputDir)) {
    rimraf.sync(outputDir)
  }

  fs.mkdirSync(outputDir, { recursive: true })

  for (const [key, style] of Object.entries(styleValues)) {
    // if we're an image fill grab the image url
    if (file.styles[key].styleType === 'FILL') {
      const fills = style.props as Figma.Paint[]

      for (const fill of fills) {
        if (fill.type === 'IMAGE' && fill.imageRef) {
          fileName = await downloadFillImage(
            {
              imageRef: fill.imageRef,
              url: imageFills.meta.images[fill.imageRef],
            },
            outputDir,
          )
        }
      }
    }

    styleValues[key] = {
      ...file.styles[key],
      ...style,
      ...(fileName ? { fileName } : {}),
    }
  }

  return { styles: figmaToJson(styleValues), exports }
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
}: any) => {
  if (!client || !file) return
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

  fs.writeFileSync(
    path.join(output, `index.${typescript ? 'ts' : 'js'}`),
    prettier.format(
      `
      const styles = {
      colors: ${util.inspect(colors, {
        depth: Infinity,
        compact: false,
        maxArrayLength: null,
      })},
      gradients: ${util.inspect(gradients, {
        depth: Infinity,
        compact: false,
        maxArrayLength: null,
      })},
      imageFills: ${util.inspect(imageFills, {
        depth: Infinity,
        compact: false,
        maxArrayLength: null,
      })},
      textStyles: ${util.inspect(textStyles, {
        depth: Infinity,
        compact: false,
        maxArrayLength: null,
      })},
      effectStyles: ${util.inspect(effectStyles, {
        depth: Infinity,
        compact: false,
        maxArrayLength: null,
      })},
      raw: ${util.inspect(styles, {
        depth: Infinity,
        compact: false,
        maxArrayLength: null,
      })},
      }${typescript ? ' as const' : ''}

      ${
        typescript
          ? `
        export type ColorValues = keyof typeof styles.colors
        export type GradientValues = keyof typeof styles.gradients
        export type TextValues = keyof typeof styles.textStyles
        export type EffectValues = keyof typeof styles.effectStyles
        `
          : ''
      }

      export default styles`,
      { ...options, parser: typescript ? 'typescript' : 'babel' },
    ),
  )

  setLoading(false)

  // set our local state
  setFills(styles.fillStyles)
  setTypography(styles.textStyles)
  setExports(styles.exports)
}
