URL on frontend: https://d1c3mejtij68x1.cloudfront.net/

URL on backend: https://api.shop-angular-cloudfront.tech

# Available Commands

The project uses a `Makefile` to automate common tasks.

## Deployment & Build

- `make build-ui`: Build the Angular frontend for production.
- `make build-api`: Build the Go Lambda functions for the API (targeting Linux/ARM64).
- `make deploy`: Build both frontend and backend, then deploy all infrastructure stacks to AWS via CDK.
- `make seed`: Seed the remote DynamoDB table with initial product data.

## Local Development (LocalStack)

- `make deploy-local`: Bootstrap and deploy the API stack to LocalStack using `cdklocal`.
- `make seed-local`: Seed the local DynamoDB table in LocalStack.
- `make local-up`: Start the local environment (starts Docker Compose, deploys stacks, and seeds data).
- `make local-down`: Spin down the local environment and cleanup.
