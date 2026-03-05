import { toast } from "sonner";

type Token = {
    value: string;
    expiry: number;
}

export function setWithExpiry(key: string, value: string, ttl: number) {
    const now = Date.now();

    // `item` is an object which contains the original value
    // as well as the time when it's supposed to expire
    const item: Token = {
        value: value,
        expiry: now + ttl,
    }
    localStorage.setItem(key, JSON.stringify(item))
}

export function getWithExpiry(key: string) {
    const itemStr = localStorage.getItem(key);

    if (!itemStr) return null;

    if (itemStr === "undefined") {
        localStorage.removeItem(key);
        return null;
    }

    if (itemStr === "null") {
        localStorage.removeItem(key);
        return null;
    }

    try {
        const item = JSON.parse(itemStr) as Token;

        const now = Date.now(); // local system time in ms

        if (now > item.expiry) {
            localStorage.removeItem(key);
            return null;
        }

        return item.value;
    } catch (err) {
        console.error("Invalid localStorage data for key:", key, err);
        toast.error("Invalid localStorage data for key: " + key);
        localStorage.removeItem(key);
        return null;
    }
}