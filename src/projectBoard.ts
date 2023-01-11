import {gql} from '@apollo/client/core'
import {githubClient} from './graphql'
import {Octokit} from '@octokit/core'
import {getOctokit} from './octokitHelper'
import {IIssueStats} from './repoStats'
import * as core from '@actions/core'

export class ProjectBoard {
  private octokit: Octokit
  constructor(
    protected projectOwner: string,
    protected owner: string,
    protected repo: string,
    private id = '',
    private weightFieldId = ''
  ) {
    this.octokit = getOctokit()
  }

  private async getProjectBoard(title: string) {
    const res = await githubClient().query({
      query: gql`
        query ($login: String!) {
          organization(login: $login) {
            projectsV2(first: 100) {
              nodes {
                id
                title
              }
            }
          }
          user(login: $login) {
            projectsV2(first: 100) {
              nodes {
                id
                title
              }
            }
          }
        }
      `,
      variables: {login: this.projectOwner},
      errorPolicy: 'ignore'
    })

    if (res.data.organization) {
      const board = res.data.organization.projectsV2.nodes.find(
        (item: {title: string}) => title === item.title
      )
      if (board) {
        this.id = board.id
      }
    } else if (res.data.user) {
      const board = res.data.user.projectsV2.nodes.find(
        (item: {title: string}) => title === item.title
      )
      if (board) {
        this.id = board.id
      }
    }
  }

  private async getOwnerNodeId() {
    const res = await this.octokit.request('GET /users/{username}', {
      username: this.projectOwner
    })
    return res.data.node_id
  }

  private async createLabels() {
    const labels = ['needs-triage', 'triaged', 'on-deck']

    for (const label of labels) {
      await this.octokit.request('POST /repos/{owner}/{repo}/labels', {
        owner: this.owner,
        repo: this.repo,
        name: label
      })
    }
  }

  async createProject(title: string) {
    await this.getProjectBoard(title)
    if (this.id) {
      core.info(`Found existing project board '${title}'`)
      const res = await githubClient().query({
        query: gql`
          query GetProject($projectId: ID!) {
            node(id: $projectId) {
              ... on ProjectV2 {
                id
                databaseId
                number
                field(name: "Weight") {
                  ... on ProjectV2Field {
                    id
                  }
                }
              }
            }
          }
        `,
        variables: {projectId: this.id}
      })
      this.weightFieldId = res.data.node.field.id
      return this.weightFieldId
    }

    core.info(`Creating project board '${title}'`)
    const ownerId = await this.getOwnerNodeId()

    const result = await githubClient().mutate({
      mutation: gql`
        mutation CreateProject($ownerId: ID!, $title: String!) {
          createProjectV2(input: {ownerId: $ownerId, title: $title}) {
            projectV2 {
              id
            }
          }
        }
      `,
      variables: {
        ownerId,
        title
      }
    })

    if (!this.weightFieldId) {
      return null
    }
    this.id = result.data.createProjectV2.projectV2.id
    return this.weightFieldId
  }

  async removeIssue(nodeId: string) {
    core.debug(`Removing issue with id: ${nodeId}`)
    await githubClient().mutate({
      mutation: gql`
        mutation RemoveItem($projectId: ID!, $itemId: ID!) {
          deleteProjectV2Item(input: {projectId: $projectId, itemId: $itemId}) {
            deletedItemId
          }
        }
      `,
      variables: {
        projectId: this.id,
        itemId: nodeId
      }
    })
  }

  async addIssue(nodeId: string) {
    core.debug(`Adding issue with id: ${nodeId}`)
    await githubClient().mutate({
      mutation: gql`
        mutation AddItem($projectId: ID!, $contentId: ID!) {
          addProjectV2ItemById(
            input: {projectId: $projectId, contentId: $contentId}
          ) {
            item {
              id
            }
          }
        }
      `,
      variables: {
        projectId: this.id,
        contentId: nodeId
      }
    })
  }

  async addIssues(issues: IIssueStats[]) {
    issues.sort((a, b) => b.weight - a.weight)
    for (const issue of issues) {
      this.addIssue(issue.node_id)
    }
  }

  async updateFieldWeight(nodeId: string, weight: number) {
    if (!weight) {
      return
    }
    await githubClient().mutate({
      mutation: gql`
        mutation UpdateWeight(
          $projectId: ID!
          $itemId: ID!
          $fieldId: ID!
          $value: Float!
        ) {
          updateProjectV2ItemFieldValue(
            input: {
              projectId: $projectId
              itemId: $itemId
              fieldId: $fieldId
              value: {number: $value}
            }
          ) {
            projectV2Item {
              id
            }
          }
        }
      `,
      variables: {
        projectId: this.id,
        itemId: nodeId,
        fieldId: this.weightFieldId,
        value: weight
      }
    })
  }

  async getIssues() {
    const issuesRes = await githubClient().query({
      query: gql`
        query ($projectId: ID!) {
          node(id: $projectId) {
            ... on ProjectV2 {
              id
              databaseId
              number
              field(name: "Weight") {
                ... on ProjectV2Field {
                  id
                }
              }
              items(first: 100) {
                nodes {
                  databaseId
                  id
                  content {
                    ... on Issue {
                      id
                      repository {
                        nameWithOwner
                      }
                    }
                    ... on PullRequest {
                      id
                      repository {
                        nameWithOwner
                      }
                    }
                  }
                  fieldValueByName(name: "Weight") {
                    ... on ProjectV2ItemFieldValueCommon {
                      field {
                        ... on ProjectV2FieldCommon {
                          id
                        }
                      }
                    }
                    ... on ProjectV2ItemFieldNumberValue {
                      id
                      number
                    }
                  }
                }
              }
            }
          }
        }
      `,
      variables: {
        projectId: this.id
      }
    })
    this.weightFieldId = issuesRes.data.node.field.id
    const issues = issuesRes.data.node.items.nodes.map(
      (item: {
        content: {id: string; repository: {nameWithOwner: string}}
        id: string
        fieldValueByName?: {number: number}
      }) => ({
        global_node_id: item.content.id,
        local_node_id: item.id,
        owner: item.content.repository.nameWithOwner,
        weight: item.fieldValueByName?.number
      })
    )
    return issues as {
      local_node_id: string
      global_node_id: string
      weight?: string
      owner: string
    }[]
  }

  async syncIssues(issues: IIssueStats[]) {
    const projectIssues = await this.getIssues()
    issues.sort((a, b) => b.weight - a.weight)

    const repoIssues = issues.map(i => ({
      node_id: i.node_id,
      owner: `${i.owner}/${i.repo}`,
      weight: i.weight
    }))

    const toAdd = repoIssues.filter(
      repo =>
        projectIssues.findIndex(
          project =>
            project.global_node_id === repo.node_id &&
            project.owner === repo.owner
        ) === -1
    )
    const toRemove = projectIssues
      .filter(project => project.owner === `${this.owner}/${this.repo}`)
      .filter(
        project =>
          repoIssues.findIndex(
            repo =>
              project.global_node_id === repo.node_id &&
              project.owner === repo.owner
          ) === -1
      )

    for (const issue of toAdd) {
      await this.addIssue(issue.node_id)
    }
    for (const issue of toRemove) {
      await this.removeIssue(issue.local_node_id)
    }

    const newIssues = await this.getIssues()
    for (const issue of newIssues) {
      const repoIssue = repoIssues.find(
        repo =>
          repo.node_id === issue.global_node_id && repo.owner === issue.owner
      )
      if (repoIssue) {
        this.updateFieldWeight(issue.local_node_id, repoIssue.weight)
      }
    }
  }
}

export default ProjectBoard
