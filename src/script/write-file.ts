import util from 'util'
import path from 'path'
import fs from 'fs'
import prettier from 'prettier'

export const toDisplayArr = (list: any[]) =>
  util.inspect(list, {
    depth: Infinity,
    compact: false,
    maxArrayLength: null,
  })

export const fileContent = ({
  typescript,
  colors,
  gradients,
  imageFills,
  textStyles,
  effectStyles,
  styles,
}: any) => {
  const exportedTypes = `
    export type ColorValues = keyof typeof styles.colors
    export type GradientValues = keyof typeof styles.gradients
    export type TextValues = keyof typeof styles.textStyles
    export type EffectValues = keyof typeof styles.effectStyles
    `

  return `
    const styles = {
    colors: ${toDisplayArr(colors)},
    gradients: ${toDisplayArr(gradients)},
    imageFills: ${toDisplayArr(imageFills)},
    textStyles: ${toDisplayArr(textStyles)},
    effectStyles: ${toDisplayArr(effectStyles)},
    raw: ${toDisplayArr(styles)},
    }${typescript ? ' as const' : ''}

    ${typescript ? exportedTypes : ''}
    export default styles`
}

export const writeStylesToFile = (props: any) => {
  const { typescript, options, output } = props
  const fileName = `index.${typescript ? 'ts' : 'js'}`
  const newContent = fileContent(props)
  // ensure file to be written has changed
  if (fs.existsSync(fileName)) {
    const oldContent = fs.readFileSync(fileName, 'utf8')
    if (oldContent === newContent) return
  }
  fs.writeFileSync(path.join(output, fileName), prettier.format(newContent), {
    ...options,
    parser: typescript ? 'typescript' : 'babel',
  })
}
