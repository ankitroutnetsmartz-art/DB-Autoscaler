import subprocess
import time

SERVICE_NAME = "backend"
MIN_REPLICAS = 1
MAX_REPLICAS = 10
CPU_UP_THRESHOLD = 10.0  # Trigger scaling at 10% for demonstration
CPU_DOWN_THRESHOLD = 5.0

def get_cpu_usage():
    cmd = "docker stats --no-stream --format '{{.CPUPerc}}' $(docker ps -q --filter name=backend)"
    try:
        output = subprocess.check_output(cmd, shell=True).decode("utf-8")
        percentages = [float(p.replace('%', '')) for p in output.splitlines() if p]
        return sum(percentages) / len(percentages) if percentages else 0
    except Exception: return 0

def scale_service(replicas):
    print(f"[*] Scaling {SERVICE_NAME} to {replicas} replicas...")
    subprocess.run(["docker", "compose", "up", "-d", "--scale", f"{SERVICE_NAME}={replicas}"])

def monitor():
    result = subprocess.check_output("docker ps --filter name=backend -q | wc -l", shell=True)
    current_replicas = int(result.decode("utf-8").strip())
    while True:
        avg_cpu = get_cpu_usage()
        print(f"[#] Avg Backend CPU: {avg_cpu}% | Nodes: {current_replicas}")
        if avg_cpu > CPU_UP_THRESHOLD and current_replicas < MAX_REPLICAS:
            current_replicas += 1
            scale_service(current_replicas)
        elif avg_cpu < CPU_DOWN_THRESHOLD and current_replicas > MIN_REPLICAS:
            current_replicas -= 1
            scale_service(current_replicas)
        time.sleep(5) # Faster polling for the demo

if __name__ == "__main__":
    monitor()
