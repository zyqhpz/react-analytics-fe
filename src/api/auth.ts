export interface LoginResponse {
    token: string;
}

export async function login(email: string, password: string): Promise<string> {
    const response = await fetch("http://localhost:8080/api/v1/auth/login", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            email,
            password,
        }),
    });

    if (!response.ok) {
        throw new Error("Login failed");
    }

    const data: LoginResponse = await response.json();

    const token = data.token;

    // store token
    localStorage.setItem("token", token);

    return token;
}
