const { writeFileSync, mkdirSync, readFileSync } = require('fs')
const nodeFetch = require('node-fetch')
const TOKEN = process.env.FIGMA_API_TOKEN

const isDefined = (node: any) => node != null
const isLeaf = (node: any) => isDefined(node) && !('children' in node)
const isEllipse = (node: any) => isDefined(node) && node.type === 'ELLIPSE'

const fetchFigmaFile = (key: string) => {
  return nodeFetch(`https://api.figma.com/v1/files/${key}`, {
    headers: { 'X-Figma-Token': TOKEN },
  }).then((response: any) => response.json())
}

const findStyleInTree = (root: any, styleId: string) => {
  if (isLeaf(root)) {
    return isEllipse(root) && root.styles && root.styles.fill === styleId
      ? root
      : undefined
  }
  return root.children
    .map((item: any) => findStyleInTree(item, styleId))
    .reduce(
      (accumulator: any, current: any) =>
        isDefined(accumulator) ? accumulator : current, // we keep the first children that uses the color
      undefined,
    )
}

const getStylesFromFile = ({ styles }: any) =>
  Object.entries(styles)
    .filter(([, { styleType }]: any) => styleType === 'FILL')
    .map(([id, { name }]: any) => ({ name, id }))

const mapStyleToNode = (file: any, styles: any[]) =>
  styles
    .map(({ name, id }: any) => {
      const node = findStyleInTree(file.document, id)
      const color =
        isEllipse(node) && node.fills[0] ? node.fills[0].color : undefined

      return { name, color }
    })
    .filter(({ color }) => isDefined(color)) // remove all not used styles

const getStyleColors = (file: any) =>
  Promise.resolve(file)
    .then(getStylesFromFile)
    .then((styles) => mapStyleToNode(file, styles))

const toHex = (value: number) => Math.round(value * 255)
const formatColor = ({ r: red, g: green, b: blue, a: alpha }: any) => {
  return alpha !== 1
    ? `rgba(${toHex(red)}, ${toHex(green)}, ${toHex(blue)}, ${toHex(alpha)})`
    : `rgb(${toHex(red)}, ${toHex(green)}, ${toHex(blue)})`
}
const formatName = (name: string) =>
  name
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // removes diacritics
    .replace(/\//g, '_') // replaces '/' by '_'
    .replace(/[^a-zA-Z0-9_]/g, '') // removes non alphanumeric or '_' characters

const NEW_LINE = `
`
const templateSCSS = (styles: any) => {
  return styles
    .map(
      ({ name, color }: any) => `$${formatName(name)}: ${formatColor(color)};`,
    )
    .join(NEW_LINE)
}

const templateTS = (styles: any) => {
  return styles
    .map(
      ({ name, color }: any) =>
        `const ${formatName(name)} = '${formatColor(color)}';`,
    )
    .join(NEW_LINE)
}

const templateJSON = (styles: any[]) => {
  return `{${NEW_LINE}${styles
    .map(
      ({ name, color }) => `  "${formatName(name)}": "${formatColor(color)}"`,
    )
    .join(`,${NEW_LINE}`)}${NEW_LINE}}`
}

const createDir = (path: string) => {
  try {
    mkdirSync(path)
  } catch (e) {
    if (e.code !== 'EEXIST') {
      // we don't mind if the folder already exists
      throw e
    }
  }
}

const readFile = (path: string) => readFileSync(path).toString('utf-8')

const generateFiles = (styles: any[]) => {
  createDir('./build')
  writeFileSync('./build/colors.scss', templateSCSS(styles))
  writeFileSync('./build/colors.ts', templateTS(styles))
  writeFileSync('./build/colors.json', templateJSON(styles))
}

const getState = () =>
  Promise.resolve()
    .then(() => readFile('./build/colors.json'))
    .then((fileContent) => ({
      state: 'RETRIEVED',
      data: JSON.parse(fileContent),
    }))
    .catch((e) =>
      e.code === 'ENOENT'
        ? Promise.resolve({
            // the script has not been run yet
            state: 'EMPTY',
          })
        : Promise.reject(e),
    )

const getAddedData = (lastData: any, newData: any) =>
  Object.entries(newData)
    .filter(([name]) => !lastData[name])
    .map(([name]) => name)

const getDeletedData = (lastData: any, newData: any) =>
  Object.entries(lastData)
    .filter(([name]) => !newData[name])
    .map(([name]) => name)

const getUpdatedData = (lastData: any, newData: any) =>
  Object.entries(newData)
    .filter(([name, color]) => lastData[name] !== color)
    .map(([name]) => name)

const interpretChanges = (lastState: any, newState: any) => {
  if (lastState.state === 'EMPTY') {
    return {
      added: newState.data,
      updated: [],
      deleted: [],
    }
  }
  return {
    added: getAddedData(lastState.data, newState.data),
    updated: getUpdatedData(lastState.data, newState.data),
    deleted: getDeletedData(lastState.data, newState.data),
  }
}

const getVersionType = (changes: any) => {
  if (changes.deleted.length > 0) {
    return 'MAJOR'
  }
  if (changes.added.length > 0 || changes.updated.length > 0) {
    return 'MINOR'
  }
  return ''
}

const createVersionBumpType = (lastState: any) =>
  Promise.resolve()
    .then(getState)
    .then((newState) => interpretChanges(lastState, newState))
    .then(getVersionType)
    .then((versionType) => writeFileSync('./VERSION_BUMP_TYPE', versionType))

export async function getColors(fileKey: string): Promise<boolean> {
  if (!TOKEN) {
    console.error(
      'The Figma API token is not defined, you need to set an environment variable `FIGMA_API_TOKEN` to run the script',
    )
    return false
  }

  const lastState = await getState()

  return fetchFigmaFile(fileKey)
    .then(getStyleColors)
    .then(generateFiles)
    .then(() => createVersionBumpType(lastState))
    .then(() => {
      console.log('Done')
      return true
    })
    .catch((error: any) => {
      console.error('Oops something went wrong: ', error)
      return false
    })
}
