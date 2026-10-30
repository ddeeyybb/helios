import { defineEventHandler } from 'h3'

export default defineEventHandler(async (event) => {
  return {
    success: true,
    message: 'Clients API endpoint active.'
  }
})
