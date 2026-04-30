package handlers

import (
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"aws-practitioner-for-js/internal/awsclient"
	"aws-practitioner-for-js/internal/products"
	"aws-practitioner-for-js/internal/response"

	"encoding/json"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/sns"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
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

	return response.TextPlain(http.StatusOK, presignResult.URL)
}

type clients struct {
	s3Client  *s3.Client
	sqsClient *sqs.Client
}

func NewClients(ctx context.Context) (*clients, error) {
	s3Client, err := awsclient.GetS3Client(ctx)
	if err != nil {
		return nil, err
	}

	sqsClient, err := awsclient.GetSQSClient(ctx)
	if err != nil {
		return nil, err
	}

	return &clients{
		s3Client:  s3Client,
		sqsClient: sqsClient,
	}, nil
}

func ImportFileParser(ctx context.Context, request events.S3Event) error {
	queueUrl := os.Getenv("PRODUCTS_QUEUE_URL")
	if queueUrl == "" {
		log.Printf("PRODUCTS_QUEUE_URL environment variable is not set")
		return fmt.Errorf("PRODUCTS_QUEUE_URL environment variable is not set")
	}

	clients, err := NewClients(ctx)
	if err != nil {
		log.Printf("Failed to get clients: %v", err)
		return err
	}

	totalCount := 0
	for _, record := range request.Records {
		recordCount, err := parseRecord(ctx, record, clients, queueUrl)

		if err != nil {
			log.Printf("Failed to process record: %v", err)
		}

		totalCount += recordCount
	}

	log.Printf("Successfully processed %d products from CSV", totalCount)

	return nil
}

func CatalogBatchProcess(ctx context.Context, request events.SQSEvent) error {
	log.Printf("CatalogBatchProcess: processing %d records", len(request.Records))

	snsTopicArn := os.Getenv("SNS_TOPIC_ARN")
	if snsTopicArn == "" {
		log.Printf("SNS_TOPIC_ARN environment variable is not set")
		return fmt.Errorf("SNS_TOPIC_ARN environment variable is not set")
	}

	snsClient, err := awsclient.GetSNSClient(ctx)
	if err != nil {
		return err
	}

	for _, record := range request.Records {
		var product products.Product
		err := json.Unmarshal([]byte(record.Body), &product)
		if err != nil {
			log.Printf("Failed to unmarshal product from message %s: %v", record.MessageId, err)
			continue
		}

		log.Printf("Creating product: %+v", product)

		_, err = products.CreateProduct(ctx, product)
		if err != nil {
			log.Printf("Failed to create product for message %s: %v", record.MessageId, err)
		}
	}

	_, err = snsClient.Publish(ctx, &sns.PublishInput{
		TopicArn: aws.String(snsTopicArn),
		Message:  aws.String(fmt.Sprintf("Import finished, %d products have been imported", len(request.Records))),
	})

	if err != nil {
		log.Printf("Failed to publish message to SNS: %v", err)
		return err
	}

	return nil
}

func parseRecord(ctx context.Context, record events.S3EventRecord, clients *clients, queueUrl string) (int, error) {
	bucket := record.S3.Bucket.Name
	key := record.S3.Object.Key

	if !strings.HasSuffix(strings.ToLower(key), ".csv") {
		log.Printf("Skipping non-CSV file: %s", key)
		return 0, nil
	}

	log.Printf("Processing file: s3://%s/%s", bucket, key)

	obj, err := clients.s3Client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})

	if err != nil {
		return 0, fmt.Errorf("error getting object %s from bucket %s: %w", key, bucket, err)
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
			return 0, fmt.Errorf("error reading CSV record at line %d: %w", recordCount+1, err)
		}

		err = sendInQueue(ctx, clients.sqsClient, queueUrl, line)
		if err != nil {
			log.Printf("Failed to send product to SQS at line %d: %v", recordCount+1, err)
			continue
		}

		recordCount++
	}

	log.Printf("Successfully processed %d records from %s", recordCount, key)

	return recordCount, nil
}

func sendInQueue(ctx context.Context, sqsClient *sqs.Client, queueUrl string, line []string) error {
	price, err := strconv.ParseFloat(line[2], 64)
	if err != nil {
		return fmt.Errorf("error parsing price: %w", err)
	}

	count, err := strconv.Atoi(line[3])
	if err != nil {
		return fmt.Errorf("error parsing count: %w", err)
	}

	productJSON, err := json.Marshal(products.Product{
		Title:       line[0],
		Description: line[1],
		Price:       price,
		Count:       count,
	})
	if err != nil {
		return fmt.Errorf("error marshaling product: %w", err)
	}

	_, err = sqsClient.SendMessage(ctx, &sqs.SendMessageInput{
		QueueUrl:    aws.String(queueUrl),
		MessageBody: aws.String(string(productJSON)),
	})
	if err != nil {
		return fmt.Errorf("error sending product to SQS: %w", err)
	}

	return nil
}
