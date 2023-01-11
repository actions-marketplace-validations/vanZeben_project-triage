import {ApolloClient, HttpLink, InMemoryCache} from '@apollo/client/core'
import fetch from 'cross-fetch'
import * as core from '@actions/core'

export function githubClient() {
  const authToken = core.getInput('token', {required: true})
  return new ApolloClient({
    link: new HttpLink({
      uri: 'https://api.github.com/graphql',
      headers: {
        authorization: `token ${authToken}`
      },
      fetch
    }),
    cache: new InMemoryCache()
  })
}
