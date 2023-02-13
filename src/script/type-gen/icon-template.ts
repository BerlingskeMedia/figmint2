// see https://medium.com/iadvize-engineering/using-figma-api-to-extract-illustrations-and-icons-34e0c7c230fa

const getIconsBySize = (icons: any[]) => {
  const record = icons.reduce((acc: any, cur: any) => {
    if (!(cur.name.size in acc)) {
      acc[cur.name.size] = {}
    }
    acc[cur.name.size][cur.name.name] = cur.fileName
    return acc
  }, {})
  return Object.entries(record).map(([size, iconsOfSize]: any) => [
    size,
    Object.entries(iconsOfSize),
  ])
}

export const templateTS = (icons: any[], { nl }: any) => {
  const newLine = nl || '\n'
  const iconsBySize = getIconsBySize(icons)

  const iconSizeType = 'export type IconSize = keyof typeof ICON;'
  const iconNameType =
    'export type IconName<T extends IconSize> = keyof typeof ICON[T];'
  const iconsTree = `export const ICON = {${newLine}${iconsBySize
    .map(
      ([size, iconsOfSize]) =>
        `  ${size}: {${newLine}${iconsOfSize
          .map(([name, fileName]: any) => `    ${name}: "${fileName}"`)
          .join(`,${newLine}`)}${newLine}  }`,
    )
    .join(`,${newLine}`)}${newLine}} as const;`

  return [iconsTree, iconSizeType, iconNameType].join(newLine)
}
