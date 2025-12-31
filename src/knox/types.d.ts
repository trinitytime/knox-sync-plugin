interface KnoxProjectType {
  projectId: string
  projectName: string
}

interface KnoxProjectListType {
  pageNumber: number
  totalPages: number
  pageSize: number
  totalElements: number
  projects: KnoxProjectType[]
}

interface KnoxGroupType {
  defaultYn: 'Y' | 'N'
  subject: string
  uid: string
  projectId: string
}

interface TaskSummaryType {
  subject: string
  uid: string
  status: string // COMPLETED, NEED_ACTION
  groupId: string
  created: string
  modified: string
}

interface TaskSummaryListType {
  pageNumber: number
  totalPages: number
  pageSize: number
  totalElements: number
  elements: TaskSummaryType[]
}

interface TaskDetailType {
  subject: string
  uid: string
  status: string // COMPLETED, NEED_ACTION
  contents: string
  groupId: string
  projectGroupId: string
  created: string
  modified: string
}

interface FetchOptionType {
  /** @public */
  method?: string
  /** @public */
  body?: Record<string, string | number | boolean>
  /** @public */
  headers?: Record<string, string>
}
