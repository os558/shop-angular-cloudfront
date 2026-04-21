package handlers

import (
	"aws-practitioner-for-js/internal/products"
	"aws-practitioner-for-js/internal/response"
	"context"
	"encoding/json"
	"log"
	"net/http"

	"github.com/aws/aws-lambda-go/events"
)

func GetProductList(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	products, err := products.GetProducts(ctx)
	if err != nil {
		log.Printf("Failed to get products: %v", err)
		return response.ErrInternalServer(), err
	}
	return response.JSON(http.StatusOK, products)
}

func GetProductById(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	productId := request.PathParameters["productId"]

	product, err := products.GetProduct(ctx, productId)
	if err != nil {
		log.Printf("Failed to get product: %v", err)

		if err == products.ErrProductNotFound {
			return response.ErrNotFound(), nil
		}

		return response.ErrInternalServer(), nil
	}

	return response.JSON(http.StatusOK, product)
}

func CreateProduct(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	var product products.Product
	err := json.Unmarshal([]byte(request.Body), &product)
	if err != nil {
		log.Printf("Failed to unmarshal product: %v", err)
		return response.ErrBadRequest(), nil
	}

	if product.Title == "" || product.Price == 0 {
		log.Printf("Invalid product data: %v", product)
		return response.ErrBadRequest(), nil
	}

	createdProduct, err := products.CreateProduct(ctx, product)
	if err != nil {
		log.Printf("Failed to create product: %v", err)
		return response.ErrInternalServer(), nil
	}

	return response.JSON(http.StatusOK, createdProduct)
}
