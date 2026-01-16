import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  Alert,
  TextInput,
  Modal,
  Image,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { Colors, Spacing, Backgrounds, GlowColors } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { useNavigation } from "@react-navigation/native";

interface Product {
  id: string;
  name: string;
  price: string;
  imageUrl?: string;
  isActive: boolean;
  isFeatured: boolean;
  stockQuantity: number;
  categoryId?: string;
}

interface Service {
  id: string;
  name: string;
  price: string;
  imageUrl?: string;
  isActive: boolean;
  isFeatured: boolean;
  durationMinutes?: number;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  iconName?: string;
  iconColor?: string;
  type: string;
  order: number;
  isActive: boolean;
}

interface Order {
  id: string;
  orderNumber: string;
  total: string;
  status: string;
  paymentStatus: string;
  contactName?: string;
  createdAt: string;
}

type TabType = "products" | "services" | "categories" | "orders";

export default function ShopManagementScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>("products");
  const [refreshing, setRefreshing] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);

  const { data: products = [], refetch: refetchProducts } = useQuery<Product[]>({
    queryKey: ["/api/academy/shop/products"],
  });

  const { data: services = [], refetch: refetchServices } = useQuery<Service[]>({
    queryKey: ["/api/academy/shop/services"],
  });

  const { data: categories = [], refetch: refetchCategories } = useQuery<Category[]>({
    queryKey: ["/api/academy/shop/categories"],
  });

  const { data: orders = [], refetch: refetchOrders } = useQuery<Order[]>({
    queryKey: ["/api/academy/shop/orders"],
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchProducts(), refetchServices(), refetchCategories(), refetchOrders()]);
    setRefreshing(false);
  };

  const tabs: { key: TabType; label: string; icon: string; count: number }[] = [
    { key: "products", label: "Products", icon: "cube", count: products.length },
    { key: "services", label: "Services", icon: "build", count: services.length },
    { key: "categories", label: "Categories", icon: "folder", count: categories.length },
    { key: "orders", label: "Orders", icon: "receipt", count: orders.length },
  ];

  const handleAddProduct = () => {
    setEditingItem(null);
    setShowProductModal(true);
  };

  const handleEditProduct = (product: Product) => {
    setEditingItem(product);
    setShowProductModal(true);
  };

  const handleAddService = () => {
    setEditingItem(null);
    setShowServiceModal(true);
  };

  const handleEditService = (service: Service) => {
    setEditingItem(service);
    setShowServiceModal(true);
  };

  const handleAddCategory = () => {
    setEditingItem(null);
    setShowCategoryModal(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return Colors.dark.primary;
      case "processing": case "confirmed": return Colors.dark.xpCyan;
      case "cancelled": return Colors.dark.error;
      default: return Colors.dark.gold;
    }
  };

  const formatPrice = (price: string) => `AED ${parseFloat(price).toFixed(0)}`;

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-GB", { 
      day: "numeric", 
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Glow Market</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabScrollView}
        contentContainerStyle={styles.tabContainer}
      >
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab(tab.key);
            }}
            style={[
              styles.tab,
              activeTab === tab.key && styles.activeTab,
            ]}
          >
            <Ionicons
              name={tab.icon as any}
              size={18}
              color={activeTab === tab.key ? Colors.dark.gold : Colors.dark.textSecondary}
            />
            <Text style={[
              styles.tabText,
              activeTab === tab.key && styles.activeTabText,
            ]}>
              {tab.label}
            </Text>
            <View style={[
              styles.tabBadge,
              activeTab === tab.key && styles.activeTabBadge,
            ]}>
              <Text style={styles.tabBadgeText}>{tab.count}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.dark.gold}
          />
        }
      >
        {activeTab === "products" && (
          <Animated.View entering={FadeIn.duration(300)}>
            <Pressable onPress={handleAddProduct} style={styles.addButton}>
              <LinearGradient
                colors={[Colors.dark.primary + "20", Colors.dark.primary + "10"]}
                style={styles.addButtonGradient}
              >
                <Ionicons name="add-circle" size={24} color={Colors.dark.primary} />
                <Text style={styles.addButtonText}>Add Product</Text>
              </LinearGradient>
            </Pressable>

            {products.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="cube-outline" size={64} color={Colors.dark.textSecondary + "40"} />
                <Text style={styles.emptyTitle}>No Products Yet</Text>
                <Text style={styles.emptyText}>Add your first product to start selling</Text>
              </View>
            ) : (
              products.map((product, index) => (
                <Animated.View key={product.id} entering={FadeInDown.delay(index * 50).duration(300)}>
                  <Pressable 
                    onPress={() => handleEditProduct(product)}
                    style={styles.itemCard}
                  >
                    {product.imageUrl ? (
                      <Image source={{ uri: product.imageUrl }} style={styles.itemImage} />
                    ) : (
                      <View style={styles.itemImagePlaceholder}>
                        <Ionicons name="cube" size={24} color={Colors.dark.textSecondary} />
                      </View>
                    )}
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemName}>{product.name}</Text>
                      <Text style={styles.itemPrice}>{formatPrice(product.price)}</Text>
                      <View style={styles.itemMeta}>
                        <View style={[styles.statusBadge, { backgroundColor: product.isActive ? Colors.dark.primary + "20" : Colors.dark.error + "20" }]}>
                          <Text style={[styles.statusText, { color: product.isActive ? Colors.dark.primary : Colors.dark.error }]}>
                            {product.isActive ? "Active" : "Inactive"}
                          </Text>
                        </View>
                        <Text style={styles.stockText}>Stock: {product.stockQuantity}</Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={Colors.dark.textSecondary} />
                  </Pressable>
                </Animated.View>
              ))
            )}
          </Animated.View>
        )}

        {activeTab === "services" && (
          <Animated.View entering={FadeIn.duration(300)}>
            <Pressable onPress={handleAddService} style={styles.addButton}>
              <LinearGradient
                colors={[Colors.dark.xpCyan + "20", Colors.dark.xpCyan + "10"]}
                style={styles.addButtonGradient}
              >
                <Ionicons name="add-circle" size={24} color={Colors.dark.xpCyan} />
                <Text style={[styles.addButtonText, { color: Colors.dark.xpCyan }]}>Add Service</Text>
              </LinearGradient>
            </Pressable>

            {services.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="build-outline" size={64} color={Colors.dark.textSecondary + "40"} />
                <Text style={styles.emptyTitle}>No Services Yet</Text>
                <Text style={styles.emptyText}>Add services like stringing, massage, coaching</Text>
              </View>
            ) : (
              services.map((service, index) => (
                <Animated.View key={service.id} entering={FadeInDown.delay(index * 50).duration(300)}>
                  <Pressable 
                    onPress={() => handleEditService(service)}
                    style={styles.itemCard}
                  >
                    <View style={[styles.itemImagePlaceholder, { backgroundColor: Colors.dark.xpCyan + "20" }]}>
                      <Ionicons name="build" size={24} color={Colors.dark.xpCyan} />
                    </View>
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemName}>{service.name}</Text>
                      <Text style={[styles.itemPrice, { color: Colors.dark.xpCyan }]}>{formatPrice(service.price)}</Text>
                      <View style={styles.itemMeta}>
                        <View style={[styles.statusBadge, { backgroundColor: service.isActive ? Colors.dark.primary + "20" : Colors.dark.error + "20" }]}>
                          <Text style={[styles.statusText, { color: service.isActive ? Colors.dark.primary : Colors.dark.error }]}>
                            {service.isActive ? "Active" : "Inactive"}
                          </Text>
                        </View>
                        {service.durationMinutes && (
                          <Text style={styles.stockText}>{service.durationMinutes} min</Text>
                        )}
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={Colors.dark.textSecondary} />
                  </Pressable>
                </Animated.View>
              ))
            )}
          </Animated.View>
        )}

        {activeTab === "categories" && (
          <Animated.View entering={FadeIn.duration(300)}>
            <Pressable onPress={handleAddCategory} style={styles.addButton}>
              <LinearGradient
                colors={[Colors.dark.gold + "20", Colors.dark.gold + "10"]}
                style={styles.addButtonGradient}
              >
                <Ionicons name="add-circle" size={24} color={Colors.dark.gold} />
                <Text style={[styles.addButtonText, { color: Colors.dark.gold }]}>Add Category</Text>
              </LinearGradient>
            </Pressable>

            {categories.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="folder-outline" size={64} color={Colors.dark.textSecondary + "40"} />
                <Text style={styles.emptyTitle}>No Categories Yet</Text>
                <Text style={styles.emptyText}>Create categories to organize your products</Text>
              </View>
            ) : (
              categories.map((category, index) => (
                <Animated.View key={category.id} entering={FadeInDown.delay(index * 50).duration(300)}>
                  <Pressable style={styles.itemCard}>
                    <View style={[styles.itemImagePlaceholder, { backgroundColor: (category.iconColor || Colors.dark.xpCyan) + "20" }]}>
                      <Ionicons name={(category.iconName || "folder") as any} size={24} color={category.iconColor || Colors.dark.xpCyan} />
                    </View>
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemName}>{category.name}</Text>
                      <Text style={styles.categorySlug}>/{category.slug}</Text>
                      <View style={styles.itemMeta}>
                        <View style={[styles.typeBadge, { backgroundColor: category.type === "service" ? Colors.dark.xpCyan + "20" : Colors.dark.primary + "20" }]}>
                          <Text style={[styles.typeText, { color: category.type === "service" ? Colors.dark.xpCyan : Colors.dark.primary }]}>
                            {category.type}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={Colors.dark.textSecondary} />
                  </Pressable>
                </Animated.View>
              ))
            )}
          </Animated.View>
        )}

        {activeTab === "orders" && (
          <Animated.View entering={FadeIn.duration(300)}>
            {orders.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="receipt-outline" size={64} color={Colors.dark.textSecondary + "40"} />
                <Text style={styles.emptyTitle}>No Orders Yet</Text>
                <Text style={styles.emptyText}>Orders from players will appear here</Text>
              </View>
            ) : (
              orders.map((order, index) => (
                <Animated.View key={order.id} entering={FadeInDown.delay(index * 50).duration(300)}>
                  <Pressable style={styles.orderCard}>
                    <View style={styles.orderHeader}>
                      <Text style={styles.orderNumber}>{order.orderNumber}</Text>
                      <View style={[styles.orderStatusBadge, { backgroundColor: getStatusColor(order.status) + "20" }]}>
                        <Text style={[styles.orderStatusText, { color: getStatusColor(order.status) }]}>
                          {order.status}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.orderDetails}>
                      <View style={styles.orderRow}>
                        <Text style={styles.orderLabel}>Customer</Text>
                        <Text style={styles.orderValue}>{order.contactName || "Anonymous"}</Text>
                      </View>
                      <View style={styles.orderRow}>
                        <Text style={styles.orderLabel}>Total</Text>
                        <Text style={styles.orderTotal}>{formatPrice(order.total)}</Text>
                      </View>
                      <View style={styles.orderRow}>
                        <Text style={styles.orderLabel}>Payment</Text>
                        <Text style={[styles.orderValue, { color: order.paymentStatus === "paid" ? Colors.dark.primary : Colors.dark.gold }]}>
                          {order.paymentStatus}
                        </Text>
                      </View>
                      <View style={styles.orderRow}>
                        <Text style={styles.orderLabel}>Date</Text>
                        <Text style={styles.orderValue}>{formatDate(order.createdAt)}</Text>
                      </View>
                    </View>
                  </Pressable>
                </Animated.View>
              ))
            )}
          </Animated.View>
        )}

        <View style={{ height: insets.bottom + 40 }} />
      </ScrollView>

      <ProductModal
        visible={showProductModal}
        onClose={() => setShowProductModal(false)}
        editingProduct={editingItem}
        categories={categories}
        onSuccess={() => {
          refetchProducts();
          setShowProductModal(false);
        }}
      />

      <ServiceModal
        visible={showServiceModal}
        onClose={() => setShowServiceModal(false)}
        editingService={editingItem}
        categories={categories}
        onSuccess={() => {
          refetchServices();
          setShowServiceModal(false);
        }}
      />

      <CategoryModal
        visible={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        onSuccess={() => {
          refetchCategories();
          setShowCategoryModal(false);
        }}
      />
    </View>
  );
}

function ProductModal({ visible, onClose, editingProduct, categories, onSuccess }: {
  visible: boolean;
  onClose: () => void;
  editingProduct: Product | null;
  categories: Category[];
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [stockQuantity, setStockQuantity] = useState("0");
  const [categoryId, setCategoryId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isFeatured, setIsFeatured] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  React.useEffect(() => {
    if (editingProduct) {
      setName(editingProduct.name);
      setPrice(editingProduct.price);
      setStockQuantity(String(editingProduct.stockQuantity));
      setCategoryId(editingProduct.categoryId || "");
      setIsActive(editingProduct.isActive);
      setIsFeatured(editingProduct.isFeatured);
    } else {
      setName("");
      setPrice("");
      setDescription("");
      setStockQuantity("0");
      setCategoryId("");
      setIsActive(true);
      setIsFeatured(false);
    }
  }, [editingProduct, visible]);

  const handleSubmit = async () => {
    if (!name.trim() || !price.trim()) {
      Alert.alert("Error", "Name and price are required");
      return;
    }

    setIsSubmitting(true);
    try {
      const data = {
        name: name.trim(),
        price,
        description: description.trim() || undefined,
        shortDescription: description.trim()?.substring(0, 100) || undefined,
        stockQuantity: parseInt(stockQuantity) || 0,
        categoryId: categoryId || undefined,
        isActive,
        isFeatured,
      };

      if (editingProduct) {
        await apiRequest("PATCH", `/api/academy/shop/products/${editingProduct.id}`, data);
      } else {
        await apiRequest("POST", "/api/academy/shop/products", data);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSuccess();
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to save product");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!editingProduct) return;

    Alert.alert(
      "Delete Product",
      "Are you sure you want to delete this product?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await apiRequest("DELETE", `/api/academy/shop/products/${editingProduct.id}`);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              onSuccess();
            } catch (error: any) {
              Alert.alert("Error", error.message || "Failed to delete product");
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={modalStyles.container}>
        <View style={modalStyles.header}>
          <Pressable onPress={onClose} style={modalStyles.closeButton}>
            <Ionicons name="close" size={24} color={Colors.dark.text} />
          </Pressable>
          <Text style={modalStyles.title}>{editingProduct ? "Edit Product" : "Add Product"}</Text>
          {editingProduct && (
            <Pressable onPress={handleDelete} style={modalStyles.deleteButton}>
              <Ionicons name="trash" size={20} color={Colors.dark.error} />
            </Pressable>
          )}
        </View>

        <ScrollView style={modalStyles.content} showsVerticalScrollIndicator={false}>
          <View style={modalStyles.field}>
            <Text style={modalStyles.label}>Name *</Text>
            <TextInput
              style={modalStyles.input}
              value={name}
              onChangeText={setName}
              placeholder="Product name"
              placeholderTextColor={Colors.dark.textSecondary}
            />
          </View>

          <View style={modalStyles.field}>
            <Text style={modalStyles.label}>Price (AED) *</Text>
            <TextInput
              style={modalStyles.input}
              value={price}
              onChangeText={setPrice}
              placeholder="0.00"
              placeholderTextColor={Colors.dark.textSecondary}
              keyboardType="decimal-pad"
            />
          </View>

          <View style={modalStyles.field}>
            <Text style={modalStyles.label}>Description</Text>
            <TextInput
              style={[modalStyles.input, modalStyles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Product description"
              placeholderTextColor={Colors.dark.textSecondary}
              multiline
              numberOfLines={4}
            />
          </View>

          <View style={modalStyles.field}>
            <Text style={modalStyles.label}>Stock Quantity</Text>
            <TextInput
              style={modalStyles.input}
              value={stockQuantity}
              onChangeText={setStockQuantity}
              placeholder="0"
              placeholderTextColor={Colors.dark.textSecondary}
              keyboardType="number-pad"
            />
          </View>

          <View style={modalStyles.toggleRow}>
            <Text style={modalStyles.label}>Active</Text>
            <Pressable
              onPress={() => setIsActive(!isActive)}
              style={[modalStyles.toggle, isActive && modalStyles.toggleActive]}
            >
              <View style={[modalStyles.toggleThumb, isActive && modalStyles.toggleThumbActive]} />
            </Pressable>
          </View>

          <View style={modalStyles.toggleRow}>
            <Text style={modalStyles.label}>Featured</Text>
            <Pressable
              onPress={() => setIsFeatured(!isFeatured)}
              style={[modalStyles.toggle, isFeatured && modalStyles.toggleActive]}
            >
              <View style={[modalStyles.toggleThumb, isFeatured && modalStyles.toggleThumbActive]} />
            </Pressable>
          </View>

          <Pressable
            onPress={handleSubmit}
            disabled={isSubmitting}
            style={[modalStyles.submitButton, isSubmitting && { opacity: 0.5 }]}
          >
            <Text style={modalStyles.submitButtonText}>
              {isSubmitting ? "Saving..." : editingProduct ? "Update Product" : "Add Product"}
            </Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

function ServiceModal({ visible, onClose, editingService, categories, onSuccess }: {
  visible: boolean;
  onClose: () => void;
  editingService: Service | null;
  categories: Category[];
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [isActive, setIsActive] = useState(true);
  const [isFeatured, setIsFeatured] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  React.useEffect(() => {
    if (editingService) {
      setName(editingService.name);
      setPrice(editingService.price);
      setDurationMinutes(String(editingService.durationMinutes || 60));
      setIsActive(editingService.isActive);
      setIsFeatured(editingService.isFeatured);
    } else {
      setName("");
      setPrice("");
      setDescription("");
      setDurationMinutes("60");
      setIsActive(true);
      setIsFeatured(false);
    }
  }, [editingService, visible]);

  const handleSubmit = async () => {
    if (!name.trim() || !price.trim()) {
      Alert.alert("Error", "Name and price are required");
      return;
    }

    setIsSubmitting(true);
    try {
      const data = {
        name: name.trim(),
        price,
        description: description.trim() || undefined,
        shortDescription: description.trim()?.substring(0, 100) || undefined,
        durationMinutes: parseInt(durationMinutes) || 60,
        isActive,
        isFeatured,
      };

      if (editingService) {
        await apiRequest("PATCH", `/api/academy/shop/services/${editingService.id}`, data);
      } else {
        await apiRequest("POST", "/api/academy/shop/services", data);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSuccess();
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to save service");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={modalStyles.container}>
        <View style={modalStyles.header}>
          <Pressable onPress={onClose} style={modalStyles.closeButton}>
            <Ionicons name="close" size={24} color={Colors.dark.text} />
          </Pressable>
          <Text style={modalStyles.title}>{editingService ? "Edit Service" : "Add Service"}</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView style={modalStyles.content} showsVerticalScrollIndicator={false}>
          <View style={modalStyles.field}>
            <Text style={modalStyles.label}>Name *</Text>
            <TextInput
              style={modalStyles.input}
              value={name}
              onChangeText={setName}
              placeholder="Service name"
              placeholderTextColor={Colors.dark.textSecondary}
            />
          </View>

          <View style={modalStyles.field}>
            <Text style={modalStyles.label}>Price (AED) *</Text>
            <TextInput
              style={modalStyles.input}
              value={price}
              onChangeText={setPrice}
              placeholder="0.00"
              placeholderTextColor={Colors.dark.textSecondary}
              keyboardType="decimal-pad"
            />
          </View>

          <View style={modalStyles.field}>
            <Text style={modalStyles.label}>Description</Text>
            <TextInput
              style={[modalStyles.input, modalStyles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Service description"
              placeholderTextColor={Colors.dark.textSecondary}
              multiline
              numberOfLines={4}
            />
          </View>

          <View style={modalStyles.field}>
            <Text style={modalStyles.label}>Duration (minutes)</Text>
            <TextInput
              style={modalStyles.input}
              value={durationMinutes}
              onChangeText={setDurationMinutes}
              placeholder="60"
              placeholderTextColor={Colors.dark.textSecondary}
              keyboardType="number-pad"
            />
          </View>

          <View style={modalStyles.toggleRow}>
            <Text style={modalStyles.label}>Active</Text>
            <Pressable
              onPress={() => setIsActive(!isActive)}
              style={[modalStyles.toggle, isActive && modalStyles.toggleActive]}
            >
              <View style={[modalStyles.toggleThumb, isActive && modalStyles.toggleThumbActive]} />
            </Pressable>
          </View>

          <View style={modalStyles.toggleRow}>
            <Text style={modalStyles.label}>Featured</Text>
            <Pressable
              onPress={() => setIsFeatured(!isFeatured)}
              style={[modalStyles.toggle, isFeatured && modalStyles.toggleActive]}
            >
              <View style={[modalStyles.toggleThumb, isFeatured && modalStyles.toggleThumbActive]} />
            </Pressable>
          </View>

          <Pressable
            onPress={handleSubmit}
            disabled={isSubmitting}
            style={[modalStyles.submitButton, isSubmitting && { opacity: 0.5 }]}
          >
            <Text style={modalStyles.submitButtonText}>
              {isSubmitting ? "Saving..." : editingService ? "Update Service" : "Add Service"}
            </Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

function CategoryModal({ visible, onClose, onSuccess }: {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [iconName, setIconName] = useState("pricetag");
  const [type, setType] = useState<"product" | "service">("product");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert("Error", "Name is required");
      return;
    }

    setIsSubmitting(true);
    try {
      await apiRequest("POST", "/api/academy/shop/categories", {
        name: name.trim(),
        iconName,
        type,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setName("");
      onSuccess();
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to create category");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={modalStyles.container}>
        <View style={modalStyles.header}>
          <Pressable onPress={onClose} style={modalStyles.closeButton}>
            <Ionicons name="close" size={24} color={Colors.dark.text} />
          </Pressable>
          <Text style={modalStyles.title}>Add Category</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView style={modalStyles.content} showsVerticalScrollIndicator={false}>
          <View style={modalStyles.field}>
            <Text style={modalStyles.label}>Name *</Text>
            <TextInput
              style={modalStyles.input}
              value={name}
              onChangeText={setName}
              placeholder="Category name"
              placeholderTextColor={Colors.dark.textSecondary}
            />
          </View>

          <View style={modalStyles.field}>
            <Text style={modalStyles.label}>Type</Text>
            <View style={modalStyles.typeSelector}>
              <Pressable
                onPress={() => setType("product")}
                style={[modalStyles.typeButton, type === "product" && modalStyles.typeButtonActive]}
              >
                <Text style={[modalStyles.typeButtonText, type === "product" && modalStyles.typeButtonTextActive]}>
                  Product
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setType("service")}
                style={[modalStyles.typeButton, type === "service" && modalStyles.typeButtonActive]}
              >
                <Text style={[modalStyles.typeButtonText, type === "service" && modalStyles.typeButtonTextActive]}>
                  Service
                </Text>
              </Pressable>
            </View>
          </View>

          <Pressable
            onPress={handleSubmit}
            disabled={isSubmitting}
            style={[modalStyles.submitButton, isSubmitting && { opacity: 0.5 }]}
          >
            <Text style={modalStyles.submitButtonText}>
              {isSubmitting ? "Creating..." : "Create Category"}
            </Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundDefault,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  tabScrollView: {
    flexGrow: 0,
  },
  tabContainer: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundSecondary,
    gap: Spacing.xs,
  },
  activeTab: {
    backgroundColor: Colors.dark.gold + "20",
    borderWidth: 1,
    borderColor: Colors.dark.gold + "40",
  },
  tabText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },
  activeTabText: {
    color: Colors.dark.gold,
    fontWeight: "600",
  },
  tabBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: Colors.dark.backgroundDefault,
  },
  activeTabBadge: {
    backgroundColor: Colors.dark.gold + "30",
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: Spacing.lg,
  },
  addButton: {
    marginBottom: Spacing.lg,
  },
  addButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
    borderStyle: "dashed",
    gap: Spacing.sm,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing.xl * 2,
    gap: Spacing.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    backgroundColor: Backgrounds.card,
    borderRadius: 12,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  itemImage: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: Colors.dark.backgroundDefault,
  },
  itemImagePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: Colors.dark.backgroundDefault,
    alignItems: "center",
    justifyContent: "center",
  },
  itemInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  itemName: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: 2,
  },
  itemPrice: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.primary,
    marginBottom: Spacing.xs,
  },
  itemMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  stockText: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  categorySlug: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.xs,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  typeText: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  orderCard: {
    padding: Spacing.md,
    backgroundColor: Backgrounds.card,
    borderRadius: 12,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  orderNumber: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  orderStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  orderStatusText: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  orderDetails: {
    gap: Spacing.xs,
  },
  orderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  orderLabel: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  orderValue: {
    fontSize: 13,
    color: Colors.dark.text,
  },
  orderTotal: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
});

const modalStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundDefault,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  deleteButton: {
    padding: Spacing.xs,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  content: {
    flex: 1,
    padding: Spacing.lg,
  },
  field: {
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.xs,
  },
  input: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: 16,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  textArea: {
    height: 100,
    textAlignVertical: "top",
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: 2,
  },
  toggleActive: {
    backgroundColor: Colors.dark.primary,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.dark.textSecondary,
  },
  toggleThumbActive: {
    backgroundColor: Colors.dark.text,
    marginLeft: "auto",
  },
  typeSelector: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  typeButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: 12,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  typeButtonActive: {
    backgroundColor: Colors.dark.primary + "20",
    borderColor: Colors.dark.primary,
  },
  typeButtonText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    fontWeight: "500",
  },
  typeButtonTextActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  submitButton: {
    backgroundColor: GlowColors.primary,
    paddingVertical: Spacing.md,
    borderRadius: 12,
    alignItems: "center",
    marginTop: Spacing.lg,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
});
