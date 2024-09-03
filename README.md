# Check Deadlines Action

[![Check Deadlines](https://github.com/SimonWaldherr/check-deadlines-action/actions/workflows/check-deadlines.yml/badge.svg)](https://github.com/SimonWaldherr/check-deadlines-action/actions/workflows/check-deadlines.yml)

**Check Deadlines Action** is a powerful GitHub Action designed to help you manage time-sensitive tasks directly within your codebase. By embedding deadlines in your source code comments using the `@CHECK` annotation, this action ensures that you never miss a critical deadline. It automatically scans your codebase, identifies any deadlines that have passed, and notifies you by failing the workflow, prompting immediate attention to overdue tasks.

## Features

- **Automated Deadline Tracking:** The action automatically scans for deadlines within your code comments, so you don't have to worry about manually tracking important dates.
- **Customizable Annotations:** Use the `@CHECK` annotation to define deadlines, add descriptions, and include additional contextual information.
- **Integration with CI/CD:** Seamlessly integrates into your CI/CD pipeline, ensuring that any missed deadlines are caught during code reviews or scheduled checks.
- **Custom Directory Scanning:** Specify the directory you want to scan for deadlines, providing flexibility in large projects.
- **Flexible Scheduling:** Use GitHub Actions' scheduling capabilities to run the check regularly, ensuring deadlines are always monitored.

## @CHECK-Syntax

The `@CHECK` annotation is a simple yet powerful tool that allows you to embed deadlines directly in your source code. Here's how to use it:

```yaml
@CHECK(2026-12-31; Description; Additional; Info; Here)
```

- **Date (YYYY-MM-DD):** The first component is the deadline date in the `YYYY-MM-DD` format. This date indicates when the task should be completed. The action compares this date against the current date to determine if the deadline has passed.
  
- **Description:** This is a brief text that describes the task or reminder. It should be concise yet informative, providing enough detail to understand the purpose of the deadline.

- **AdditionalInfo1, AdditionalInfo2, AdditionalInfo3:** These are optional fields where you can add extra information, such as who is responsible for the task, its priority level, or any other relevant context that might be useful.

### Example

Imagine you have a piece of code that needs to be reviewed or updated by the end of 2026. You can annotate it as follows:

```javascript
// @CHECK(2026-12-31; Review the implementation of this function; Assigned to John Doe; Priority: High)
function exampleFunction() {
    // Function logic here
}
```

If this deadline passes without the task being completed, the action will trigger a warning and fail the check during your CI/CD run.

## Usage

To integrate the Check Deadlines Action into your GitHub repository, follow these steps:

1. **Create a Workflow File:** Add a new workflow file (e.g., `.github/workflows/check-deadlines.yml`) to your repository with the following configuration:

```yaml
name: Check Deadlines

on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
  schedule:
    - cron: '0 13 * * 5' # Runs every Friday at 13:00 UTC

jobs:
  check-deadlines:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v2
    - name: Check Deadlines
      uses: SimonWaldherr/check-deadlines-action@main
      with:
        dir: 'src'
```

2. **Customize the Directory:** The `dir` input specifies which directory should be scanned for deadlines. The default is the root directory (`.`), but you can change this to suit your project structure.

### Inputs

- **`dir`**: The directory to search for deadlines. Default is `.`.

### Output

When a deadline has passed, the action will output the specific line in the code where the `@CHECK` annotation is found and fail the workflow, ensuring that overdue tasks are not overlooked.

## Development

### Build

To contribute to the Check Deadlines Action or customize it for your own needs, you can build the project locally. The action is written in TypeScript, and you can build it using the following commands:

```sh
npm install
npm run build
```

### Test

Testing the action locally is straightforward with the [act](https://github.com/nektos/act) tool, which allows you to run GitHub Actions on your local machine:

```sh
act
```

This will simulate the GitHub Actions environment and help you test the action before pushing changes to your repository.

## Contributing

Contributions to the Check Deadlines Action are welcome and encouraged! Whether you want to report a bug, suggest a new feature, or improve documentation, your input is valuable. To contribute:

1. **Fork the Repository:** Create a fork of the repository to work on your changes.
2. **Create a Branch:** Develop your feature or fix on a new branch.
3. **Submit a Pull Request:** Once your changes are ready, submit a pull request for review.

Please make sure your code follows the established style and passes all tests before submitting a pull request.

## License

This project is licensed under the MIT License. You are free to use, modify, and distribute this software. For more details, see the [LICENSE](LICENSE) file in the repository.

## Acknowledgments

This action is inspired by the logic behind [my other tool](https://github.com/SimonWaldherr/gotools/tree/main/deadline), which also focuses on managing deadlines effectively within software projects.

---

By integrating Check Deadlines Action into your workflow, you can ensure that your team stays on top of important deadlines, reducing the risk of overdue tasks and improving project management within your codebase.
