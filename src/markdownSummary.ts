import {IIssueStats} from './repoStats'
import fs from 'fs/promises'
type IRepoSummary = IIssueStats & {message: string}

const issue_states = {
  NO_MAINTAINER: 0,
  ACTIVE_RESPONSE: 1,
  STALE_RESPONSE: 2
}
const issueStateIcons = ['❗', '✔️', '⚠️']

export class MarkdownSummary {
  private repoStats: IRepoSummary[]
  constructor(
    protected owner: string,
    protected repo: string,
    issueStats: IIssueStats[]
  ) {
    const allStats: IRepoSummary[] = issueStats.map((data: IIssueStats) => ({
      ...data,
      message: this.getMessage(data)
    }))

    allStats.sort((a, b) => b.weight - a.weight)
    this.repoStats = allStats
  }

  getMessage = ({
    last_member_response,
    is_member_response,
    title,
    url,
    reactions_total
  }: IIssueStats) => {
    const lastMaintainerResponseSeconds =
      (new Date().getTime() - new Date(last_member_response || 0).getTime()) /
      1000
    const issueState = !is_member_response
      ? issue_states.NO_MAINTAINER
      : Math.floor(lastMaintainerResponseSeconds / 86400) <= 14
      ? issue_states.ACTIVE_RESPONSE
      : issue_states.STALE_RESPONSE

    return `  1. ${issueStateIcons[issueState]} [${title}](${url})${
      reactions_total > 0 ? ` | ${reactions_total} 👍🏻` : ''
    }\n`
  }

  getRepoSummary = async () => {
    const pulls = this.repoStats.filter(d => d.info.is_pull)
    const issues = this.repoStats.filter(d => !d.info.is_pull)

    const items = [
      {
        label: 'Pull Requests',
        v: pulls
      },
      {
        label: 'Issues',
        v: issues
      }
    ]

    await fs.mkdir(`./data/${this.owner}-${this.repo}/`, {
      recursive: true
    })
    await fs.writeFile(
      `./data/${this.owner}-${this.repo}/data.json`,
      JSON.stringify(this.repoStats, null, 2)
    )

    let text = `## [\`${this.owner}/${this.repo}\`](https://github.com/${this.owner}/${this.repo})\n`

    text += `### Top 10 issues that need attention\n`
    for (const {message} of this.repoStats.slice(0, 10)) {
      text += message
    }

    for (const {label, v: stats} of items) {
      text += `### ${label}\n<details>\n<summary>(${stats.length} total)</summary>\n`
      let i = 1
      for (const {message} of stats) {
        text += message.replace(/\n/g, '<br/>').replace(/1./g, `${i}.`)
        i++
      }
      text += '</details>\n\n'
    }
    text += '\n\n'
    return text
  }
  get = async () => {
    const text = await this.getRepoSummary()
    await fs.appendFile(`./data/README.md`, text)
  }
}

export default MarkdownSummary
