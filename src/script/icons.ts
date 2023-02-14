import { getNamesFromProperties } from './names'

export const getIconNames = (componentName: string) => {
  const { size, name } = getNamesFromProperties(componentName)
  return { size, name }
}

export const formatIconsSVG = (svg: string) =>
  svg.replace(/fill="#[a-f0–9]{6}"/gm, 'fill="currentColor"')

const hash = (path: string) =>
  path.replace(/^.*\/img\//g, '').replace(/\//g, '_')

export interface SVGResult {
  name: {
    size: string
    name: string
  }
  fileName: string
  svg: string
}

// use getComponentsFromNode to retrieve components to extract SVGs for
export const getSVGsFromComponents = (
  key: string,
  token: string,
): ((components: any[]) => Promise<SVGResult[]>) => (components: any[]) => {
  const ids = components.map(({ id }) => id)
  return fetch(
    `https://api.figma.com/v1/images/${key}?ids=${ids.join()}&format=svg`,
    { headers: { 'X-Figma-Token': token } },
  )
    .then((response) => response.json())
    .then(({ images }) =>
      Promise.all(
        components.map(({ id, name }) =>
          fetch(images[id])
            .then((response) => response.text())
            .then(
              (svg): SVGResult => ({
                name: getIconNames(name), // or "name: getIllustrationName,"
                fileName: hash(images[id]),
                svg: formatIconsSVG(svg), // or "svg,"
              }),
            ),
        ),
      ),
    )
}
