package awsclient

import (
	"context"
	"sync"

	"github.com/aws/aws-sdk-go-v2/service/sqs"
)

var sqsOnce sync.Once
var sqsClient *sqs.Client
var sqsErr error

func GetSQSClient(ctx context.Context) (*sqs.Client, error) {
	sqsOnce.Do(func() {
		cfg, err := GetConfig(ctx)
		if err != nil {
			sqsErr = err
			return
		}

		sqsClient = sqs.NewFromConfig(cfg)
	})

	return sqsClient, sqsErr
}
