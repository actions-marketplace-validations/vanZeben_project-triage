import {Octokit} from '@octokit/core'
import {components} from '@octokit/openapi-types/types.d'
import {IssueTimeline, ITimelineItem} from './issueTimeline'
import {getOctokit} from './octokitHelper'
import * as core from '@actions/core'

export type IIssueStats = {
  id: components['schemas']['issue']['id']
  node_id: components['schemas']['issue']['node_id']
  number: components['schemas']['issue']['number']
  title: components['schemas']['issue']['title']
  url: components['schemas']['issue']['html_url']
  info: {
    is_pull: boolean
    is_stale: boolean
    is_open: boolean
    is_merged: boolean
  }
  created_at: components['schemas']['issue']['created_at']
  closed_at: components['schemas']['issue']['updated_at']
  time_alive: number
  reactions_total: number
  is_member_response?: boolean
  last_member_response?: string
  metadata: ITimelineItem[]
  weight: number
  owner: string
  repo: string
}

export class RepoStats {
  private octokit: Octokit
  constructor(protected owner: string, protected repo: string) {
    this.octokit = getOctokit()
  }

  async get() {
    const repoStats: IIssueStats[] = []
    let page = 0
    let hasData = false
    do {
      const dataPromises = await this.getPageData(page)
      if (dataPromises === null) {
        hasData = false
        break
      }
      for (const issuePromise of dataPromises) {
        const issueStats = await issuePromise
        repoStats.push(issueStats)
      }
      page++
    } while (hasData)

    return repoStats
  }

  protected getWeight = ({
    reactions_total,
    created_at,
    is_member_response,
    last_member_response,
    metadata
  }: IIssueStats) => {
    const totalDaysOpen = Math.floor(
      (new Date().getTime() - new Date(created_at || 0).getTime()) / 86400000
    )
    const lastMaintainerResponseDays = is_member_response
      ? Math.floor(
          (new Date().getTime() -
            new Date(last_member_response || 0).getTime()) /
            86400000
        )
      : 0
    const numberOfComments = metadata ? metadata.length : 0
    const weight =
      reactions_total * 20 +
      numberOfComments * 5 +
      totalDaysOpen * 1 -
      lastMaintainerResponseDays * 1 +
      (!is_member_response ? 100 : 0)
    return weight
  }

  private formatData = (data: components['schemas']['issue']) => ({
    id: data.id,
    node_id: data.node_id,
    number: data.number,
    title: data.title,
    url: data.html_url,
    info: {
      is_pull: !!data.pull_request,
      is_stale:
        new Date(data.updated_at).getTime() -
          new Date(data.created_at).getTime() >
        7 * 24 * 60 * 60 * 1000,
      is_open: !data.closed_at,
      is_merged: !!data.pull_request && !!data.pull_request.merged_at
    },
    created_at: data.created_at,
    closed_at: data.closed_at,
    time_alive: Math.round(
      data.closed_at
        ? (new Date(data.closed_at).getTime() -
            new Date(data.created_at).getTime()) /
            1000
        : (new Date().getTime() - new Date(data.created_at).getTime()) / 1000
    )
  })

  protected async getPageData(page: number, perPage = 100) {
    core.debug(`Retrieving page ${page} for ${this.owner}/${this.repo}`)
    const {data} = await this.octokit.request(
      'GET /repos/{owner}/{repo}/issues',
      {
        owner: this.owner,
        repo: this.repo,
        direction: 'asc',
        sort: 'created',
        filter: 'all',
        state: 'open',
        per_page: perPage,
        page
      }
    )
    core.debug(
      `Found ${data.length} items on page ${page} for ${this.owner}/${this.repo}`
    )
    if (data.length === 0) {
      return null
    }
    const formattedData = data.map(this.formatData).map(async d => {
      const timelineItems = await new IssueTimeline(
        this.owner,
        this.repo,
        d.number
      ).get()

      const memberResponses = timelineItems.filter(
        timelineItem =>
          timelineItem.author_association &&
          timelineItem.author_association === 'MEMBER'
      )
      const issueStat = {
        ...d,
        reactions_total:
          (timelineItems.length
            ? timelineItems[0]?.reactions?.total_count
            : 0) || 0,
        is_member_response: memberResponses.length > 0,
        ...(memberResponses.length > 0 && {
          last_member_response:
            memberResponses[memberResponses.length - 1].created_at
        }),
        metadata: timelineItems
      } as IIssueStats
      return {
        ...issueStat,
        weight: this.getWeight(issueStat),
        owner: this.owner,
        repo: this.repo
      } as IIssueStats
    })

    return formattedData
  }
}

export default RepoStats
