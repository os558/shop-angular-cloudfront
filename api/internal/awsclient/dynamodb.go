package awsclient

import (
	"context"
	"sync"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
)

var dOnce sync.Once
var dClient *dynamodb.Client
var dErr error

func GetDynamoDBClient(ctx context.Context) (*dynamodb.Client, error) {
	dOnce.Do(func() {
		cfg, err := GetConfig(ctx)
		if err != nil {
			dErr = err
			return
		}

		dClient = dynamodb.NewFromConfig(cfg)
	})

	return dClient, dErr
}
