package handlers

import (
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"aws-practitioner-for-js/internal/awsclient"
	"aws-practitioner-for-js/internal/response"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

var UPLOAD_FOLDER = "uploaded"

func ImportProducts(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	fileName := request.QueryStringParameters["name"]

	if fileName == "" {
		return response.JSON(http.StatusBadRequest, map[string]string{
			"error": "`name` query parameter is required",
		})
	}

	bucketName := os.Getenv("BUCKET_NAME")
	if bucketName == "" {
		log.Printf("BUCKET_NAME environment variable is not set")
		return response.ErrInternalServer(), nil
	}

	s3Client, err := awsclient.GetS3Client(ctx)
	if err != nil {
		log.Printf("Failed to get S3 client: %v", err)
		return response.ErrInternalServer(), nil
	}

	presignClient := s3.NewPresignClient(s3Client)

	presignResult, err := presignClient.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(bucketName),
		Key:    aws.String(UPLOAD_FOLDER + "/" + fileName),
	}, s3.WithPresignExpires(15*time.Minute))

	if err != nil {
		return response.ErrInternalServer(), nil
	}

	return response.JSON(http.StatusOK, map[string]string{
		"url": presignResult.URL,
	})
}

func ImportFileParser(ctx context.Context, request events.S3Event) error {
	s3Client, err := awsclient.GetS3Client(ctx)
	if err != nil {
		log.Printf("Failed to get S3 client: %v", err)
		return err
	}

	for _, record := range request.Records {
		err := parseRecord(ctx, s3Client, record)

		if err != nil {
			log.Printf("Failed to process record: %v", err)
		}
	}

	return nil
}

func parseRecord(ctx context.Context, s3Client *s3.Client, record events.S3EventRecord) error {
	bucket := record.S3.Bucket.Name
	key := record.S3.Object.Key

	if !strings.HasSuffix(strings.ToLower(key), ".csv") {
		log.Printf("Skipping non-CSV file: %s", key)
		return nil
	}

	log.Printf("Processing file: s3://%s/%s", bucket, key)

	obj, err := s3Client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})

	if err != nil {
		return fmt.Errorf("error getting object %s from bucket %s: %w", key, bucket, err)
	}
	defer obj.Body.Close()

	csvReader := csv.NewReader(obj.Body)
	recordCount := 0

	for {
		line, err := csvReader.Read()

		if err == io.EOF {
			break
		}

		if err != nil {
			return fmt.Errorf("error reading CSV record at line %d: %w", recordCount+1, err)
		}

		log.Printf("CSV Record [%s]: %v", key, line)

		recordCount++
	}

	log.Printf("Successfully processed %d records from %s", recordCount, key)

	return nil
}
