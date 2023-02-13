import * as Figma from 'figma-js'
import fs from 'fs'
import path from 'path'
import rimraf from 'rimraf'
import { downloadFillImage, figmaToJson } from '../utils'
import { RawStyleObject, RawStyleType, ExportsObject } from '../utils/types'

// work through the node and its children to attach all style definitions to the style types
export const findStyleInNode = (
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
