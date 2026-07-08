package http

import (
	"net/http"
	"strconv"

	"github.com/eyeeyeai/pilot/internal/platform/ratelimit"
	"github.com/gin-gonic/gin"
)

func rateLimitMiddleware(limiter *ratelimit.IPLimiter, keyFn func(*gin.Context) string) gin.HandlerFunc {
	return func(c *gin.Context) {
		key := keyFn(c)
		if limiter.TooMany(key) {
			writeRateLimitHeaders(c, limiter, 0)
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "too many requests"})
			return
		}
		limiter.Record(key)
		writeRateLimitHeaders(c, limiter, limiter.Remaining(key))
		c.Next()
	}
}

func writeRateLimitHeaders(c *gin.Context, limiter *ratelimit.IPLimiter, remaining int) {
	retryAfter := int(limiter.Window().Seconds())
	if retryAfter < 1 {
		retryAfter = 60
	}
	c.Header("Retry-After", strconv.Itoa(retryAfter))
	c.Header("X-RateLimit-Limit", strconv.Itoa(limiter.Max()))
	c.Header("X-RateLimit-Remaining", strconv.Itoa(remaining))
}

func (h *Handler) rateLimitByIP(limiter *ratelimit.IPLimiter) gin.HandlerFunc {
	return rateLimitMiddleware(limiter, h.clientIP)
}

func (h *Handler) rateLimitByUser(limiter *ratelimit.IPLimiter) gin.HandlerFunc {
	return rateLimitMiddleware(limiter, func(c *gin.Context) string {
		if claims := claimsFromContext(c); claims != nil && claims.UserID != "" {
			return claims.UserID
		}
		return h.clientIP(c)
	})
}

func trustedClientIP(c *gin.Context, trusted []string) string {
	peer := c.ClientIP()
	if !isTrustedIP(peer, trusted) {
		return peer
	}
	if xff := c.GetHeader("X-Forwarded-For"); xff != "" {
		return trimFirstIP(xff)
	}
	return peer
}

func isTrustedIP(ip string, trusted []string) bool {
	for _, t := range trusted {
		if ip == t {
			return true
		}
	}
	return false
}

func trimFirstIP(xff string) string {
	for i := 0; i < len(xff); i++ {
		if xff[i] == ',' {
			return trimSpace(xff[:i])
		}
	}
	return trimSpace(xff)
}

func trimSpace(s string) string {
	for len(s) > 0 && (s[0] == ' ' || s[0] == '\t') {
		s = s[1:]
	}
	for len(s) > 0 && (s[len(s)-1] == ' ' || s[len(s)-1] == '\t') {
		s = s[:len(s)-1]
	}
	return s
}
