# Project Triage
The purpose of this project is to provide an action that will automatically weight and triage issues and pull requests into a centralized project board. This helps with surfacing visibility of Issues and PRs

GitHub's present Project API is quite limited, so presently, after you setup the workflow, the first run will fail as you need to add a `Weight` custom field to the project. This field represents the importance of the issue. The higher the number, the bigger it's impact. Sorting your project by this number descending is a good idea.

# Usage

<!-- start usage -->
```yaml
- uses: vanZeben/project-triage@v1
  with:
    # Personal access token (PAT) used to access the project. 
    # Also when generating a new PAT, select the least scopes necessary [project, read-project]. 
    #
    # [Learn more about creating and using encrypted secrets](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/creating-and-using-encrypted-secrets)
    #
    # Required!
    # Default: ${{ github.token }}
    token: ''
    
    # Organization or User who the triaging project will be created for
    #
    # Default: ${{ github.repository_owner }}
    projectOwner: ''

    # Desired name for the project board
    #
    # Default: OSS Triage Board
    projectName: ''
```


# Example Workflow
```yaml
name: Triage

# Run a triage on the current repository once a day at 7am GMT
# The project will exist under the owner of the current repository
on:
  schedule:
    - cron: "0 7 * * *"

jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
    - uses: vanZeben/project-triage@v1
      with:
        token: ${{ secrets.GH_TOKEN }}
 ```


# License

The scripts and documentation in this project are released under the [MIT License](LICENSE)
