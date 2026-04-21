package main

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"log"

	"os"

	"aws-practitioner-for-js/internal/awsclient"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
)

//go:embed products.json
var productsJSON []byte

type Product struct {
	ID          string  `json:"id"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	Price       float64 `json:"price"`
	Count       int     `json:"count"`
}

type ProductDTO struct {
	ID          string  `json:"id" dynamodbav:"id"`
	Title       string  `json:"title" dynamodbav:"title"`
	Description string  `json:"description" dynamodbav:"description"`
	Price       float64 `json:"price" dynamodbav:"price"`
}

type StockDTO struct {
	ProductID string `json:"productId" dynamodbav:"product_id"`
	Count     int    `json:"count" dynamodbav:"count"`
}

func main() {
	var products []Product
	if err := json.Unmarshal(productsJSON, &products); err != nil {
		log.Fatalf("failed to parse JSON: %v", err)
	}

	var stocksDTO []StockDTO
	var productsDTO []ProductDTO

	for _, p := range products {
		productsDTO = append(productsDTO, ProductDTO{
			ID:          p.ID,
			Title:       p.Title,
			Description: p.Description,
			Price:       p.Price,
		})
		stocksDTO = append(stocksDTO, StockDTO{
			ProductID: p.ID,
			Count:     p.Count,
		})
	}

	ctx := context.Background()

	cfg, err := awsclient.GetConfig(ctx)
	if err != nil {
		log.Fatalf("failed to load AWS config: %v", err)
	}

	// Modern way to override endpoint for local development
	svc := dynamodb.NewFromConfig(cfg, func(o *dynamodb.Options) {
		if endpoint := os.Getenv("LOCALSTACK_ENDPOINT"); endpoint != "" {
			o.BaseEndpoint = aws.String(endpoint)
		}
	})

	// Put each product into DynamoDB
	successCount := 0
	for i := range products {
		productItem, err := attributevalue.MarshalMap(productsDTO[i])
		if err != nil {
			log.Printf("failed to marshal product %q: %v", productsDTO[i].ID, err)
			continue
		}

		_, err = svc.PutItem(ctx, &dynamodb.PutItemInput{
			TableName: aws.String("products"),
			Item:      productItem,
		})
		if err != nil {
			log.Printf("failed to put item %q: %v", productsDTO[i].ID, err)
			continue
		}

		fmt.Printf("  ✓ Inserted: %s (%s)\n", productsDTO[i].ID, productsDTO[i].Title)
		successCount++
	}

	fmt.Printf("\nDone! Inserted %d/%d products into table `products`.\n", successCount, len(products))

	successCount = 0

	for i := range products {
		stockItem, err := attributevalue.MarshalMap(stocksDTO[i])
		if err != nil {
			log.Printf("failed to marshal stock %q: %v", stocksDTO[i].ProductID, err)
			continue
		}

		_, err = svc.PutItem(ctx, &dynamodb.PutItemInput{
			TableName: aws.String("stocks"),
			Item:      stockItem,
		})
		if err != nil {
			log.Printf("failed to put item %q: %v", stocksDTO[i].ProductID, err)
			continue
		}

		fmt.Printf("  ✓ Inserted: %s (%d)\n", stocksDTO[i].ProductID, stocksDTO[i].Count)

		successCount++
	}

	fmt.Printf("\nDone! Inserted %d/%d stocks into table `stocks`.\n", successCount, len(products))
}
