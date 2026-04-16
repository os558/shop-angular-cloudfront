package products

import (
	"context"
	"errors"
	"os"
	"sync"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
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

// Using the Config value, create the DynamoDB client
var getClient = sync.OnceValues(func() (*dynamodb.Client, error) {
	cfg, err := config.LoadDefaultConfig(context.Background())
	if err != nil {
		return nil, err
	}

	return dynamodb.NewFromConfig(cfg), nil
})

func GetProducts(ctx context.Context) ([]Product, error) {
	var wg sync.WaitGroup

	productTableName := os.Getenv("PRODUCTS_TABLE_NAME")
	stockTableName := os.Getenv("STOCKS_TABLE_NAME")

	svc, err := getClient()

	if err != nil {
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

func scan(ctx context.Context, svc *dynamodb.Client, tableName string, dto interface{}, errCh chan<- error) {
	result, err := svc.Scan(ctx, &dynamodb.ScanInput{
		TableName: aws.String(tableName),
	})

	if err != nil {
		errCh <- err
		return
	}

	err = attributevalue.UnmarshalListOfMaps(result.Items, dto)

	if err != nil {
		errCh <- err
		return
	}
}

func GetProduct(ctx context.Context, id string) (Product, error) {
	productTableName := os.Getenv("PRODUCTS_TABLE_NAME")
	stockTableName := os.Getenv("STOCKS_TABLE_NAME")

	svc, err := getClient()

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
		return Product{}, err
	}

	var stockDTO StockDTO
	err = attributevalue.UnmarshalMap(stockResult.Item, &stockDTO)
	if err != nil {
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

func CreateProduct(ctx context.Context, product Product) (Product, error) {
	productTableName := os.Getenv("PRODUCTS_TABLE_NAME")
	stockTableName := os.Getenv("STOCKS_TABLE_NAME")

	svc, err := getClient()

	if err != nil {
		return Product{}, err
	}

	if product.ID == "" {
		product.ID = uuid.New().String()
	}

	productItem, stockItem, err := mapProductToDTO(product)
	if err != nil {
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
		return Product{}, err
	}

	return product, nil
}

type AttributeValue map[string]types.AttributeValue

func mapProductToDTO(product Product) (AttributeValue, AttributeValue, error) {
	productDTO := ProductDTO{
		ID:          product.ID,
		Title:       product.Title,
		Description: product.Description,
		Price:       product.Price,
	}

	productItem, err := attributevalue.MarshalMap(productDTO)
	if err != nil {
		return nil, nil, err
	}

	stockDTO := StockDTO{
		ProductID: product.ID,
		Count:     product.Count,
	}

	stockItem, err := attributevalue.MarshalMap(stockDTO)
	if err != nil {
		return nil, nil, err
	}

	return productItem, stockItem, nil
}

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
