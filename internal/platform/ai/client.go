package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"time"
)

type Client struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

func NewClient(baseURL, apiKey string, timeout time.Duration) (*Client, error) {
	if err := ValidateInferenceURL(baseURL); err != nil {
		return nil, err
	}
	if timeout <= 0 {
		timeout = 60 * time.Second
	}
	return &Client{
		baseURL: baseURL,
		apiKey:  apiKey,
		httpClient: &http.Client{
			Timeout: timeout,
		},
	}, nil
}

func (c *Client) Enabled() bool {
	return c != nil && c.baseURL != ""
}

func (c *Client) Analyze(ctx context.Context, meta InferenceRequest, imageData []byte, filename, mimeType string) (*InferenceResponse, error) {
	if !c.Enabled() {
		return nil, fmt.Errorf("ai client not configured")
	}

	var body bytes.Buffer
	w := multipart.NewWriter(&body)

	metaJSON, err := json.Marshal(meta)
	if err != nil {
		return nil, err
	}
	if err := w.WriteField("metadata", string(metaJSON)); err != nil {
		return nil, err
	}

	part, err := w.CreateFormFile("image", filename)
	if err != nil {
		return nil, err
	}
	if _, err := part.Write(imageData); err != nil {
		return nil, err
	}
	if err := w.Close(); err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL, &body)
	if err != nil {
		return nil, err
	}
	if u, err := url.Parse(c.baseURL); err == nil && u.Hostname() != "" && os.Getenv("APP_ENV") == "production" {
		if err := validateResolvedIPs(u.Hostname()); err != nil {
			return nil, err
		}
	}
	req.Header.Set("Content-Type", w.FormDataContentType())
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}
	if mimeType != "" {
		req.Header.Set("X-Image-Mime-Type", mimeType)
	}

	res, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, fmt.Errorf("ai inference status %d: %s", res.StatusCode, string(respBody))
	}

	var out InferenceResponse
	if err := json.Unmarshal(respBody, &out); err != nil {
		return nil, fmt.Errorf("decode ai response: %w", err)
	}
	var raw map[string]any
	_ = json.Unmarshal(respBody, &raw)
	out.Raw = raw
	return &out, nil
}
