import * as core from '@actions/core'
import {Octokit, Octokit as OctokitCoreType} from '@octokit/core'
let _octokit: Octokit

export const getOctokit = () => {
  if (!_octokit) {
    const authToken = core.getInput('token', {required: true})

    _octokit = new OctokitCoreType({
      auth: authToken
    })
  }
  return _octokit
}
