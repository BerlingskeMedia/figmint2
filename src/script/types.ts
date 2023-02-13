import { PartialFigmintExportType } from '../utils'

export type DownloadListType = {
  [formatScale: string]: PartialFigmintExportType[]
}

export type FinalExportsType = {
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
