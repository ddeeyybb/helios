import { defineEventHandler } from 'h3'

export default defineEventHandler(async (event) => {
  return {
    success: true,
    message: 'Projects API endpoint active.'
  }
})
