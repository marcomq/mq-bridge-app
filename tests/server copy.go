package main
// # go run server.go
// # wrk -t8 -c200 -d30s http://localhost:8080



import (
	"fmt"
	"log"
	"net/http"
	"sync/atomic"
	"time"
)

// requestCount is a global, atomic counter for requests.
var requestCount uint64

// helloWorldPayload is the pre-rendered response for the helloHandler to avoid allocations.
var helloWorldPayload = []byte("Hello, World!")

// metricsMiddleware is a middleware that counts every request.
func metricsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Atomically increment the counter for each incoming request.
		// This is safe for concurrent access by many goroutines.
		atomic.AddUint64(&requestCount, 1)
		// Call the next handler in the chain.
		next.ServeHTTP(w, r)
	})
}

func helloHandler(w http.ResponseWriter, r *http.Request) {
	// A simple handler that responds quickly.
	// For latency tests, an artificial delay can be added here:
	// time.Sleep(50 * time.Millisecond)
	w.Write(helloWorldPayload)
}

// reportThroughput periodically prints the throughput (requests per second).
func reportThroughput(interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	// This loop runs forever in the background.
	for range ticker.C {
		// Read the current counter value and reset it to 0 at the same time.
		// This is an atomic operation to avoid data loss.
		count := atomic.SwapUint64(&requestCount, 0)

		// Calculate the requests per second for the last interval.
		rps := float64(count) / interval.Seconds()
		log.Printf("Current throughput: %.2f req/s\n", rps)
	}
}

func main() {
	// Start a separate goroutine that measures and prints the throughput every 5 seconds.
	go reportThroughput(5 * time.Second)

	finalHandler := http.HandlerFunc(helloHandler)
	http.Handle("/", metricsMiddleware(finalHandler))

	fmt.Println("Server starting on http://localhost:8080")
	// Fatal if the server cannot be started.
	log.Fatal(http.ListenAndServe(":8080", nil))
}
