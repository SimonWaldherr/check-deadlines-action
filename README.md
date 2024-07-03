# Check Deadlines Action

A GitHub Action to check for deadlines in source code comments. It searches for the `@CHECK` annotation and verifies if the specified deadline has passed. If it has, it prints the line and returns an error.

<details>
  <summary>@CHECK-Syntax</summary>
  
  ```
  @CHECK(2024-12-31; Description; Additional; Info; Here)
  ```
  
  1. **Date (YYYY-MM-DD)**: The first component is the deadline date in the `YYYY-MM-DD` format. This is the date by which the task or reminder should be completed. The action checks this date against the current date to determine if the deadline has passed.
  
  2. **Description**: A brief description of the task or reminder. This helps to quickly identify the purpose of the annotation.
  
  3. **AdditionalInfo1, AdditionalInfo2, AdditionalInfo3**: These are optional fields for additional information related to the task or reminder. You can use these fields to provide extra context, such as responsible persons, priority, or any other relevant details.

</details>

## Usage

To use this action in your repository, create a workflow file (e.g., `.github/workflows/check-deadlines.yml`) with the following content:

```yaml
name: Check Deadlines

on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main

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

### Inputs

- `dir`: The directory to search for deadlines. Default is `.`.

### Example

Here's an example of how to use the `@CHECK` annotation in your source code:

```javascript
// @CHECK(2024-12-31; Description; Additional; Info; Here)
// This is a line of code that needs to be checked for a deadline.
```

If the current date is after `2024-12-31`, this action will print a warning and fail the check.

## Development

### Build

To build the TypeScript code, run:

```sh
npm install
npm run build
```

### Test

To test the action locally, you can use the [act](https://github.com/nektos/act) tool.

## Trivia

based on the idea and logic behind [my other tool](https://github.com/SimonWaldherr/gotools/tree/main/deadline).

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.
