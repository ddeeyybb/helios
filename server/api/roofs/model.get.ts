import { defineEventHandler, getQuery } from 'h3'
import { getStoredRoofModel } from './model.post'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const projectId = (query.projectId as string) || 'current-project'

  const model = getStoredRoofModel(projectId)

  if (model) {
    return {
      success: true,
      data: model
    }
  }

  return {
    success: false,
    message: 'No RoofModel stored for this project.',
    data: null
  }
})
