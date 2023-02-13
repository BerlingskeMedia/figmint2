// see https://medium.com/iadvize-engineering/using-figma-api-to-extract-illustrations-and-icons-34e0c7c230fa

export const templateTS = (illustrations: any[], { nl }: any) => {
  const newLine = nl || '\n'
  const type = 'export type IllustrationName = keyof typeof ILLUSTRATION;'
  return `export const ILLUSTRATION = {${newLine}${illustrations
    .map(({ name, fileName }) => ` ${name}: "${fileName}"`)
    .join(`,${newLine}`)}${newLine}} as const;${newLine}${type}`
}
