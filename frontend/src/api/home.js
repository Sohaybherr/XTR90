import api from './api'

let homeResponse = null
let homeRequest = null

export function clearHomeCache() {
  homeResponse = null
  homeRequest = null
}

export const getHome = ({ force = false } = {}) => {
  if (!force && homeResponse) {
    return Promise.resolve(homeResponse)
  }

  if (!force && homeRequest) {
    return homeRequest
  }

  homeRequest = api.get('/home', { params: { daysBack: 3, daysForward: 7 } }).then((response) => {
    homeResponse = response
    return response
  }).finally(() => {
    homeRequest = null
  })

  return homeRequest
}
