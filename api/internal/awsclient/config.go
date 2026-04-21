package awsclient

import (
	"context"
	"sync"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
)

var cOnce sync.Once

var cCfg aws.Config
var cErr error

func GetConfig(ctx context.Context) (aws.Config, error) {
	cOnce.Do(func() {
		cCfg, cErr = config.LoadDefaultConfig(ctx)
	})

	return cCfg, cErr
}
