package products

import (
	"context"
	"errors"
	"log"
	"os"
	"sync"

	"aws-practitioner-for-js/internal/awsclient"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/google/uuid"
)

var ErrProductNotFound = errors.New("product not found")

// Product model for API response
type Product struct {
	ID          string  `json:"id"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	Price       float64 `json:"price"`
	Count       int     `json:"count"`
}

// Product DTO for DynamoDB
type ProductDTO struct {
	ID          string  `json:"id" dynamodbav:"id"`
	Title       string  `json:"title" dynamodbav:"title"`
	Description string  `json:"description" dynamodbav:"description"`
	Price       float64 `json:"price" dynamodbav:"price"`
}

// Stock DTO for DynamoDB
type StockDTO struct {
	ProductID string `json:"productId" dynamodbav:"product_id"`
	Count     int    `json:"count" dynamodbav:"count"`
}

// GetProducts returns all products with their stocks
func GetProducts(ctx context.Context) ([]Product, error) {
	var wg sync.WaitGroup

	productTableName := os.Getenv("PRODUCTS_TABLE_NAME")
	stockTableName := os.Getenv("STOCKS_TABLE_NAME")

	svc, err := awsclient.GetDynamoDBClient(ctx)

	if err != nil {
		log.Printf("Failed to get DynamoDB client: %v", err)

		return nil, err
	}

	var productsDTO []ProductDTO
	var stocksDTO []StockDTO

	errCh := make(chan error, 2)

	// Get products from DynamoDB
	wg.Go(func() {
		scan(ctx, svc, productTableName, &productsDTO, errCh)
	})

	// Get stocks from DynamoDB
	wg.Go(func() {
		scan(ctx, svc, stockTableName, &stocksDTO, errCh)
	})

	// Wait for both goroutines to finish
	wg.Wait()

	// Check for errors
	select {
	case err := <-errCh:
		return nil, err
	default:
	}

	// Convert slice to map for faster lookup
	stocksMap := make(map[string]int)
	for _, s := range stocksDTO {
		stocksMap[s.ProductID] = s.Count
	}

	// Merge products and stocks
	var products []Product

	for _, p := range productsDTO {
		products = append(products, Product{
			ID:          p.ID,
			Title:       p.Title,
			Description: p.Description,
			Price:       p.Price,
			Count:       stocksMap[p.ID],
		})
	}

	return products, nil
}

// scan scans a DynamoDB table and unmarshals the result to the given DTO
func scan(ctx context.Context, svc *dynamodb.Client, tableName string, dto interface{}, errCh chan<- error) {
	result, err := svc.Scan(ctx, &dynamodb.ScanInput{
		TableName: aws.String(tableName),
	})

	if err != nil {
		log.Printf("Failed to scan table %s: %v", tableName, err)

		errCh <- err
		return
	}

	err = attributevalue.UnmarshalListOfMaps(result.Items, dto)

	if err != nil {
		log.Printf("Failed to unmarshal items from table %s: %v", tableName, err)

		errCh <- err
		return
	}
}

// GetProduct returns a product with its stock by id
func GetProduct(ctx context.Context, id string) (Product, error) {
	productTableName := os.Getenv("PRODUCTS_TABLE_NAME")
	stockTableName := os.Getenv("STOCKS_TABLE_NAME")

	svc, err := awsclient.GetDynamoDBClient(ctx)

	result, err := svc.TransactGetItems(ctx, &dynamodb.TransactGetItemsInput{
		TransactItems: []types.TransactGetItem{
			{
				Get: getItemInput(productTableName, "id", id),
			},
			{
				Get: getItemInput(stockTableName, "product_id", id),
			},
		},
	})

	if err != nil {
		log.Printf("Failed to get items from tables: %v", err)

		return Product{}, err
	}

	productResult := result.Responses[0]
	stockResult := result.Responses[1]

	if productResult.Item == nil {
		return Product{}, ErrProductNotFound
	}

	var productDTO ProductDTO
	err = attributevalue.UnmarshalMap(productResult.Item, &productDTO)
	if err != nil {
		log.Printf("Failed to unmarshal product: %v", err)

		return Product{}, err
	}

	var stockDTO StockDTO
	err = attributevalue.UnmarshalMap(stockResult.Item, &stockDTO)
	if err != nil {
		log.Printf("Failed to unmarshal stock: %v", err)

		return Product{}, err
	}

	return Product{
		ID:          productDTO.ID,
		Title:       productDTO.Title,
		Description: productDTO.Description,
		Price:       productDTO.Price,
		Count:       stockDTO.Count,
	}, nil
}

// CreateProduct creates a new product with its stock
func CreateProduct(ctx context.Context, product Product) (Product, error) {
	productTableName := os.Getenv("PRODUCTS_TABLE_NAME")
	stockTableName := os.Getenv("STOCKS_TABLE_NAME")

	svc, err := awsclient.GetDynamoDBClient(ctx)

	if err != nil {
		log.Printf("Failed to get DynamoDB client: %v", err)

		return Product{}, err
	}

	if product.ID == "" {
		product.ID = uuid.New().String()
	}

	productItem, stockItem, err := mapProductToDTO(product)
	if err != nil {
		log.Printf("Failed to map product to DTO: %v", err)

		return Product{}, err
	}

	_, err = svc.TransactWriteItems(ctx, &dynamodb.TransactWriteItemsInput{
		ClientRequestToken: aws.String(product.ID),
		TransactItems: []types.TransactWriteItem{
			{
				Put: &types.Put{
					TableName:           aws.String(productTableName),
					Item:                productItem,
					ConditionExpression: aws.String("attribute_not_exists(id)"),
				},
			},
			{
				Put: &types.Put{
					TableName:           aws.String(stockTableName),
					Item:                stockItem,
					ConditionExpression: aws.String("attribute_not_exists(product_id)"),
				},
			},
		},
	})

	if err != nil {
		log.Printf("Failed to write items to tables: %v", err)

		return Product{}, err
	}

	return product, nil
}

type AttributeValue map[string]types.AttributeValue

// mapProductToDTO maps a Product to ProductDTO and StockDTO
func mapProductToDTO(product Product) (AttributeValue, AttributeValue, error) {
	productDTO := ProductDTO{
		ID:          product.ID,
		Title:       product.Title,
		Description: product.Description,
		Price:       product.Price,
	}

	productItem, err := attributevalue.MarshalMap(productDTO)
	if err != nil {
		log.Printf("Failed to marshal product: %v", err)

		return nil, nil, err
	}

	stockDTO := StockDTO{
		ProductID: product.ID,
		Count:     product.Count,
	}

	stockItem, err := attributevalue.MarshalMap(stockDTO)
	if err != nil {
		log.Printf("Failed to marshal stock: %v", err)

		return nil, nil, err
	}

	return productItem, stockItem, nil
}

// getItemInput returns a Get item input for a DynamoDB table
func getItemInput(tableName, key, id string) *types.Get {
	return &types.Get{
		TableName: aws.String(tableName),
		Key: map[string]types.AttributeValue{
			key: &types.AttributeValueMemberS{
				Value: id,
			},
		},
	}
}
