def calculate_severity(area_percentage):

    if area_percentage < 1:
        return "LOW"

    elif area_percentage <= 5:
        return "MEDIUM"

    else:
        return "HIGH"


if __name__ == "__main__":

    test_area = 25.01

    severity = calculate_severity(
        test_area
    )

    print("======================================")
    print("INSPECTRA - SEVERITY CHECK")
    print("======================================")

    print(f"\nEstimated affected area: {test_area:.2f}%")
    print(f"Severity: {severity}")

    print("\n======================================")
    print("SEVERITY CHECK COMPLETE")
    print("======================================")