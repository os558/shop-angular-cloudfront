package main

import (
	"aws-practitioner-for-js/internal/handlers"

	"github.com/aws/aws-lambda-go/lambda"
)

func main() {
	lambda.Start(handlers.UpdateProduct)
}
