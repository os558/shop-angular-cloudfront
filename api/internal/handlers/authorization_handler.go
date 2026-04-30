package handlers

import (
	"context"
	"encoding/base64"
	"errors"
	"log"
	"os"
	"strings"

	"github.com/aws/aws-lambda-go/events"
)

func generatePolicy(principalID, effect, resource string) events.APIGatewayCustomAuthorizerResponse {
	authResponse := events.APIGatewayCustomAuthorizerResponse{PrincipalID: principalID}

	if effect != "" && resource != "" {
		authResponse.PolicyDocument = events.APIGatewayCustomAuthorizerPolicy{
			Version: "2012-10-17",
			Statement: []events.IAMPolicyStatement{
				{
					Action:   []string{"execute-api:Invoke"},
					Effect:   effect,
					Resource: []string{resource},
				},
			},
		}
	}

	return authResponse
}

func BasicAuthorizer(ctx context.Context, request events.APIGatewayCustomAuthorizerRequest) (events.APIGatewayCustomAuthorizerResponse, error) {
	basicAuth := os.Getenv("BASIC_USER")
	if basicAuth == "" {
		log.Printf("BASIC_USER environment variable is not set")
		return events.APIGatewayCustomAuthorizerResponse{}, errors.New("Unauthorized")
	}

	basicPassword := os.Getenv("BASIC_PASSWORD")
	if basicPassword == "" {
		log.Printf("BASIC_PASSWORD environment variable is not set")
		return events.APIGatewayCustomAuthorizerResponse{}, errors.New("Unauthorized")
	}

	encodedAuthString := base64.StdEncoding.EncodeToString(
		[]byte(basicAuth + ":" + basicPassword),
	)

	authHeader := request.AuthorizationToken
	if authHeader == "" {
		return events.APIGatewayCustomAuthorizerResponse{}, errors.New("Unauthorized")
	}

	token := strings.TrimPrefix(authHeader, "Basic ")
	resource := request.MethodArn
	arnParts := strings.Split(request.MethodArn, "/")
	if len(arnParts) >= 2 {
		resource = arnParts[0] + "/" + arnParts[1] + "/*"
	}

	if token != encodedAuthString {
		return generatePolicy("user", "Deny", resource), nil
	}

	return generatePolicy("user", "Allow", resource), nil
}
