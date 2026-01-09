import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface CartItem {
  id: string;
  type: "product" | "service";
  productId?: string;
  serviceId?: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string;
  iconName?: string;
  variantId?: string;
  variantName?: string;
  durationMinutes?: number;
  serviceDetails?: {
    preferredDate?: string;
    preferredTime?: string;
    notes?: string;
  };
}

interface CartContextType {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  total: number;
  addItem: (item: Omit<CartItem, "id">) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  setDiscount: (percent: number) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_STORAGE_KEY = "@glow_market_cart";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [discountPercent, setDiscountPercent] = useState(0);

  useEffect(() => {
    loadCart();
  }, []);

  useEffect(() => {
    saveCart();
  }, [items]);

  const loadCart = async () => {
    try {
      const stored = await AsyncStorage.getItem(CART_STORAGE_KEY);
      if (stored) {
        setItems(JSON.parse(stored));
      }
    } catch (error) {
      console.error("Failed to load cart:", error);
    }
  };

  const saveCart = async () => {
    try {
      await AsyncStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch (error) {
      console.error("Failed to save cart:", error);
    }
  };

  const addItem = (item: Omit<CartItem, "id">) => {
    setItems((prev) => {
      const existingIndex = prev.findIndex(
        (i) =>
          (i.productId && i.productId === item.productId && i.variantId === item.variantId) ||
          (i.serviceId && i.serviceId === item.serviceId)
      );

      if (existingIndex >= 0) {
        if (item.type === "product") {
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            quantity: updated[existingIndex].quantity + item.quantity,
          };
          return updated;
        }
        return prev;
      }

      const newItem: CartItem = {
        ...item,
        id: `${item.type}-${item.productId || item.serviceId}-${Date.now()}`,
      };
      return [...prev, newItem];
    });
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity < 1) {
      removeItem(id);
      return;
    }
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, quantity } : item))
    );
  };

  const clearCart = () => {
    setItems([]);
  };

  const setDiscount = (percent: number) => {
    setDiscountPercent(percent);
  };

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discountAmount = subtotal * (discountPercent / 100);
  const total = subtotal - discountAmount;

  return (
    <CartContext.Provider
      value={{
        items,
        itemCount,
        subtotal,
        discountPercent,
        discountAmount,
        total,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        setDiscount,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within CartProvider");
  }
  return context;
}
