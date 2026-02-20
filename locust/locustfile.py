from locust import HttpUser, task, between

class AppUser(HttpUser):
    wait_time = between(1, 2)

    @task(2)
    def get_data(self):
        self.client.get("/api/data")

    @task(1)
    def post_data(self):
        self.client.post("/api/data", json={"message": "Load Test Entry"})
