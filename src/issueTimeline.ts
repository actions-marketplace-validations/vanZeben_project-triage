import {Octokit} from '@octokit/core'
import {components} from '@octokit/openapi-types/types.d'
import {getOctokit} from './octokitHelper'
import * as core from '@actions/core'

export type ITimelineItem = {
  user?: components['schemas']['timeline-issue-events']['user']
  event?: components['schemas']['timeline-issue-events']['event']
  created_at: components['schemas']['issue']['created_at']
  updated_at: components['schemas']['issue']['updated_at']
  author_association?: components['schemas']['issue']['author_association']
  reactions?: components['schemas']['issue']['reactions']
  body?: components['schemas']['issue']['body']
  label?: components['schemas']['timeline-issue-events']['label']
  rename?: components['schemas']['timeline-issue-events']['rename']
}

export class IssueTimeline {
  private octokit: Octokit
  constructor(
    protected owner: string,
    protected repo: string,
    protected issueNumber: number
  ) {
    this.octokit = getOctokit()
  }

  private formatIssue = (data: components['schemas']['issue']) =>
    ({
      ...(data.user && {
        user: data.user
      }),
      created_at: data.created_at,
      updated_at: data.updated_at,
      ...(data.author_association && {
        author_association: data.author_association
      }),
      ...(data.reactions && {
        reactions: {
          ...data.reactions,
          url: undefined
        }
      }),
      ...(data.body && {
        body: data.body
      })
    } as ITimelineItem)

  private formatTimelineEvent = (
    data: components['schemas']['timeline-issue-events']
  ) =>
    ({
      ...(data.user && {
        user: data.user
      }),
      event: data.event,
      created_at: data.created_at || data.submitted_at,
      updated_at: data.updated_at,
      ...(data.author_association && {
        author_association: data.author_association
      }),
      ...(data.reactions && {
        reactions: {
          ...data.reactions,
          url: undefined
        }
      }),
      ...(data.body && {
        body: data.body
      }),
      ...(data.label && {
        label: data.label
      }),
      ...(data.rename && {
        rename: data.rename
      })
    } as ITimelineItem)

  protected formatData = (
    data:
      | components['schemas']['issue']
      | components['schemas']['timeline-issue-events']
  ) => {
    if ('event' in data) {
      return this.formatTimelineEvent(data)
    }
    return this.formatIssue(data as components['schemas']['issue'])
  }

  protected getTimelinePage: (page: number) => Promise<ITimelineItem[] | null> =
    async page => {
      try {
        core.debug(
          `Fetching timeline page ${page} for ${this.owner}/${this.repo}#${this.issueNumber}`
        )
        const {data} = await this.octokit.request(
          'GET /repos/{owner}/{repo}/issues/{issueNumber}/timeline',
          {
            owner: this.owner,
            repo: this.repo,
            issueNumber: this.issueNumber,
            per_page: 100,
            page
          }
        )
        core.debug(
          `Retrieved ${data.length} items for page ${page} for ${this.owner}/${this.repo}#${this.issueNumber}`
        )
        if (data.length === 0) {
          return null
        }
        return data.map(this.formatData)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        if (err?.response?.headers['retry-after']) {
          await new Promise(r =>
            setTimeout(r, parseInt(err.response.headers['retry-after']) * 1000)
          )

          return this.getTimelinePage(page)
        } else {
          return null
        }
      }
    }

  get = async () => {
    const timeline = []
    let page = 1
    let hasData = true

    // Fetch first issue
    const {data: issueData} = await this.octokit.request(
      'GET /repos/{owner}/{repo}/issues/{issue_number}',
      {
        owner: this.owner,
        repo: this.repo,
        issue_number: this.issueNumber
      }
    )
    timeline.push(this.formatData(issueData))

    // Fetch timeline
    do {
      const pageData = await this.getTimelinePage(page)
      if (pageData === null) {
        hasData = false
        break
      }

      timeline.push(...pageData)
      page++
    } while (hasData)

    timeline.sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    return timeline
  }
}

export default IssueTimeline
