package awsclient

import (
	"context"
	"sync"

	"github.com/aws/aws-sdk-go-v2/service/sns"
)

var snsOnce sync.Once
var snsClient *sns.Client
var snsErr error

func GetSNSClient(ctx context.Context) (*sns.Client, error) {
	snsOnce.Do(func() {
		cfg, err := GetConfig(ctx)
		if err != nil {
			snsErr = err
			return
		}

		snsClient = sns.NewFromConfig(cfg)
	})

	return snsClient, snsErr
}
