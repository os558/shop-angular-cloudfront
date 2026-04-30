package awsclient

import (
	"context"
	"sync"

	"github.com/aws/aws-sdk-go-v2/service/s3"
)

var s3Once sync.Once
var s3Client *s3.Client
var s3Err error

func GetS3Client(ctx context.Context) (*s3.Client, error) {
	s3Once.Do(func() {
		cfg, err := GetConfig(ctx)
		if err != nil {
			s3Err = err
			return
		}

		s3Client = s3.NewFromConfig(cfg)
	})

	return s3Client, s3Err
}
