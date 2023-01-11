import * as core from '@actions/core'
import * as github from '@actions/github'

import RepoStats from './repoStats'
import ProjectBoard from './projectBoard'
;(async function () {
  const qualifiedRepository = `${github.context.repo.owner}/${github.context.repo.repo}`
  core.debug(`qualified repository = '${qualifiedRepository}'`)
  const splitRepository = qualifiedRepository.split('/')
  const owner = splitRepository[0]
  const repo = splitRepository[1]

  core.getInput('token', {required: true})
  const boardName = core.getInput('projectName') || 'OSS Triage Board'

  const projectOwner =
    core.getInput('projectOwner') || `${github.context.repo.owner}`

  const projectBoard = new ProjectBoard(projectOwner, owner, repo)

  const weightFieldId = await projectBoard.createProject(boardName)
  if (!weightFieldId) {
    core.error(
      `Project board '${boardName}' was created. Please go create a Custom Number Variable with the title 'Weight' and then re-run this workflow`
    )
    return
  }
  const repoStats = await new RepoStats(owner, repo).get()
  await projectBoard.syncIssues(repoStats)
})()
