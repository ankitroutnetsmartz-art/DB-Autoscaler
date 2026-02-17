from locust import HttpUser, task, between

class ClusterTrafficUser(HttpUser):
    wait_time = between(1, 2)

    @task(3)
    def read_test(self):
        # Hits the Replicas
        self.client.get("/api/data")

    @task(1)
    def write_test(self):
        # Hits the Primary
        self.client.post("/api/data", json={"message": "Locust Load Test Bolt"})
