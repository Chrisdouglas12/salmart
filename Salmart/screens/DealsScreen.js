import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DocumentPicker from 'react-native-document-picker';
import io from 'socket.io-client';

const API_BASE_URL = 'https://salmart.onrender.com';

const DealsScreen = () => {
  const [transactions, setTransactions] = useState([]);
  const [currentTab, setCurrentTab] = useState('buying');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [dealsBadgeCount, setDealsBadgeCount] = useState(0);
  
  // Modal states
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [loaderModalVisible, setLoaderModalVisible] = useState(false);
  const [responseModalVisible, setResponseModalVisible] = useState(false);
  const [refundModalVisible, setRefundModalVisible] = useState(false);
  
  // Transaction states
  const [selectedTransactionId, setSelectedTransactionId] = useState('');
  const [processingTransaction, setProcessingTransaction] = useState('');
  
  // Response modal states
  const [responseSuccess, setResponseSuccess] = useState(false);
  const [responseMessage, setResponseMessage] = useState('');
  
  // Refund form states
  const [refundReason, setRefundReason] = useState('');
  const [refundNote, setRefundNote] = useState('');
  const [refundEvidence, setRefundEvidence] = useState(null);

  const socket = io(API_BASE_URL);

  useEffect(() => {
    initializeAuth();
    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    if (userId && authToken) {
      fetchTransactions();
    }
  }, [currentTab, userId, authToken]);

  const initializeAuth = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('userId');
      const storedAuthToken = await AsyncStorage.getItem('authToken');
      
      if (storedUserId && storedAuthToken) {
        setUserId(storedUserId);
        setAuthToken(storedAuthToken);
      } else {
        Alert.alert('Authentication Error', 'Please log in to view transactions.');
        setLoading(false);
      }
    } catch (error) {
      console.error('Error getting auth data:', error);
      setLoading(false);
    }
  };

  const updateDealsBadge = (count) => {
    setDealsBadgeCount(count > 9 ? 9 : count);
  };

  const fetchTransactions = async () => {
    if (!userId || !authToken) return;

    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/get-transactions/${userId}`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.transactions || !Array.isArray(data.transactions)) {
        setTransactions([]);
        updateDealsBadge(0);
        return;
      }

      const unReadCount = data.transactions.filter((d) => !d.viewed).length;
      updateDealsBadge(unReadCount);

      setTransactions(data.transactions);
      await markDealsAsViewed();
    } catch (error) {
      console.error('Error fetching transactions:', error);
      Alert.alert('Error', 'Failed to load transactions. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const markDealsAsViewed = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/deals/mark-as-viewed`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) throw new Error('Failed to mark deals as viewed');
    } catch (error) {
      console.error('Error marking deals as viewed:', error);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchTransactions();
  };

  const showTab = (tab) => {
    setCurrentTab(tab);
  };

  const openConfirmModal = (transactionId) => {
    setSelectedTransactionId(transactionId);
    setConfirmModalVisible(true);
  };

  const closeConfirmModal = () => {
    setConfirmModalVisible(false);
    setSelectedTransactionId('');
  };

  const openResponseModal = (success, message) => {
    setResponseSuccess(success);
    setResponseMessage(message);
    setResponseModalVisible(true);
  };

  const closeResponseModal = () => {
    setResponseModalVisible(false);
    setSelectedTransactionId('');
  };

  const confirmDelivery = async (transactionId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/confirm-delivery/${transactionId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      if (response.ok) {
        return data;
      } else {
        throw new Error(data.error || data.message || 'Failed to confirm delivery');
      }
    } catch (error) {
      throw error;
    }
  };

  const handleConfirmDelivery = async () => {
    if (!selectedTransactionId) return;

    try {
      setProcessingTransaction(selectedTransactionId);
      closeConfirmModal();
      setLoaderModalVisible(true);

      const response = await confirmDelivery(selectedTransactionId);
      setLoaderModalVisible(false);

      if (response.queued) {
        openResponseModal(true, 'Delivery confirmed! Payment is queued and will be released once available.');
      } else if (response.balanceCheckFailed) {
        openResponseModal(true, 'Delivery confirmed. Payout is temporarily delayed.');
      } else {
        openResponseModal(true, response.message || 'Delivery confirmed. Payment released successfully.');
      }

      fetchTransactions();
    } catch (error) {
      setLoaderModalVisible(false);
      openResponseModal(false, error.message || 'Failed to confirm delivery. Please try again.');
    } finally {
      setProcessingTransaction('');
    }
  };

  const openRefundModal = (transactionId) => {
    setSelectedTransactionId(transactionId);
    setRefundModalVisible(true);
  };

  const closeRefundModal = () => {
    setRefundModalVisible(false);
    setSelectedTransactionId('');
    setRefundReason('');
    setRefundNote('');
    setRefundEvidence(null);
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.pickSingle({
        type: [DocumentPicker.types.images, DocumentPicker.types.pdf],
      });
      setRefundEvidence(result);
    } catch (error) {
      if (DocumentPicker.isCancel(error)) {
        // User cancelled the picker
      } else {
        Alert.alert('Error', 'Failed to pick document');
      }
    }
  };

  const submitRefund = async () => {
    if (!refundReason || !selectedTransactionId) {
      Alert.alert('Error', 'Please select a refund reason');
      return;
    }

    setLoaderModalVisible(true);

    const formData = new FormData();
    formData.append('reason', refundReason);
    if (refundNote) formData.append('note', refundNote);
    if (refundEvidence) {
      formData.append('evidence', {
        uri: refundEvidence.uri,
        type: refundEvidence.type,
        name: refundEvidence.name,
      });
    }

    try {
      const response = await fetch(`${API_BASE_URL}/request-refund/${selectedTransactionId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        body: formData,
      });

      setLoaderModalVisible(false);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error requesting refund');
      }

      const data = await response.json();
      Alert.alert('Success', data.message || 'Refund requested successfully');
      closeRefundModal();
      fetchTransactions();
    } catch (error) {
      setLoaderModalVisible(false);
      Alert.alert('Error', error.message || 'Error requesting refund. Please try again.');
    }
  };

  const renderSkeletonLoader = () => (
    <View style={styles.skeletonCard}>
      <View style={styles.skeletonContent}>
        <View style={styles.skeletonImage} />
        <View style={styles.skeletonDetails}>
          <View style={[styles.skeletonLine, { width: '80%' }]} />
          <View style={[styles.skeletonLine, { width: '60%' }]} />
          <View style={[styles.skeletonLine, { width: '40%' }]} />
        </View>
      </View>
    </View>
  );

  const renderTransactionCard = (transaction) => {
    const product = transaction.postId || {};
    const productImage = product.photo || 'Default.png';
    const productDescription = product.title || 'Product';
    const amount = transaction.amount || 0;
    const date = new Date(transaction.createdAt).toLocaleString();
    const dealUser = currentTab === 'buying' ? transaction.sellerId : transaction.buyerId;
    const dealUserName = `${dealUser?.firstName || ''} ${dealUser?.lastName || ''}`;
    const isProcessing = processingTransaction === transaction._id;

    const getStatusBadgeStyle = (status) => {
      switch (status) {
        case 'pending':
          return styles.badgePending;
        case 'released':
          return styles.badgeReleased;
        case 'refund-requested':
          return styles.badgeRefundRequested;
        default:
          return styles.badgePending;
      }
    };

    const getRefundStatusBadge = (transaction) => {
      if (!transaction.refundRequested || !transaction.refundStatus) return null;
      
      let badgeText = '';
      let badgeStyle = styles.badgeRefundRequested;
      
      switch (transaction.refundStatus) {
        case 'Refund Requested':
        case 'pending':
          badgeText = 'Refund Pending';
          break;
        case 'approved':
          badgeText = 'Refund Approved';
          badgeStyle = styles.badgeReleased;
          break;
        case 'rejected':
          badgeText = 'Refund Rejected';
          break;
        case 'refunded':
          badgeText = 'Refunded';
          badgeStyle = styles.badgeReleased;
          break;
        default:
          badgeText = 'Refund Requested';
      }
      
      return (
        <View style={[styles.badge, badgeStyle]}>
          <Text style={styles.badgeText}>{badgeText}</Text>
        </View>
      );
    };

    return (
      <View key={transaction._id} style={styles.transactionCard}>
        <View style={styles.transactionContent}>
          <Image source={{ uri: productImage }} style={styles.productImage} />
          <View style={styles.transactionDetails}>
            <Text style={styles.productTitle}>{productDescription}</Text>
            <Text style={styles.amount}>₦{Number(amount).toLocaleString('en-NG')}</Text>
            <Text style={styles.date}>{date}</Text>
            <View style={[styles.badge, getStatusBadgeStyle(transaction.status)]}>
              <Text style={styles.badgeText}>{transaction.status}</Text>
            </View>
            
            {currentTab === 'buying' && (
              <View style={styles.buttonContainer}>
                {transaction.status === 'pending' && !transaction.refundRequested && (
                  <>
                    <TouchableOpacity
                      style={[styles.confirmBtn, isProcessing && styles.disabledBtn]}
                      onPress={() => openConfirmModal(transaction._id)}
                      disabled={isProcessing}
                    >
                      <Text style={styles.buttonText}>
                        {isProcessing ? 'Processing...' : 'Confirm Delivery'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.refundBtn}
                      onPress={() => openRefundModal(transaction._id)}
                    >
                      <Text style={styles.buttonText}>Request Refund</Text>
                    </TouchableOpacity>
                  </>
                )}
                {transaction.refundRequested && getRefundStatusBadge(transaction)}
                {transaction.refundRequested && (
                  <TouchableOpacity style={styles.disabledBtn} disabled>
                    <Text style={styles.buttonText}>Delivery Confirmation Locked</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            
            <View style={styles.dealUserInfo}>
              <Text style={styles.dealUserText}>
                {currentTab === 'buying' ? 'Buying from: ' : 'Selling to: '}
                <Text style={styles.dealUserName}>{dealUserName}</Text>
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  const filteredTransactions = transactions.filter(
    (t) => (t[currentTab === 'buying' ? 'buyerId' : 'sellerId']?._id || '') === userId
  );

  const refundReasons = [
    'Item not as described',
    'Item was damaged',
    "Didn't receive the item",
    "Seller didn't respond",
    'Suspicious or fraudulent seller',
    'Other'
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Deals</Text>
        {dealsBadgeCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{dealsBadgeCount}</Text>
          </View>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, currentTab === 'buying' && styles.activeTab]}
          onPress={() => showTab('buying')}
        >
          <Text style={[styles.tabText, currentTab === 'buying' && styles.activeTabText]}>
            Buying
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, currentTab === 'selling' && styles.activeTab]}
          onPress={() => showTab('selling')}
        >
          <Text style={[styles.tabText, currentTab === 'selling' && styles.activeTabText]}>
            Selling
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView 
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <>
            {renderSkeletonLoader()}
            {renderSkeletonLoader()}
            {renderSkeletonLoader()}
          </>
        ) : filteredTransactions.length === 0 ? (
          <View style={styles.noTransactions}>
            <Text style={styles.noTransactionsText}>No transactions yet. Check back later!</Text>
          </View>
        ) : (
          filteredTransactions.map(renderTransactionCard)
        )}
      </ScrollView>

      {/* Confirmation Modal */}
      <Modal visible={confirmModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Are you sure you want to confirm delivery?</Text>
            <Text style={styles.modalSubtitle}>
              You are about to transfer funds to this seller, make sure your order has been delivered before proceeding.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirmDelivery}>
                <Text style={styles.buttonText}>Yes</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeConfirmModal}>
                <Text style={styles.buttonText}>No</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Loader Modal */}
      <Modal visible={loaderModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ActivityIndicator size="large" color="#28a745" />
            <Text style={styles.modalTitle}>Processing transfer...</Text>
          </View>
        </View>
      </Modal>

      {/* Response Modal */}
      <Modal visible={responseModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {responseSuccess ? 'Transfer Successful!' : 'Transfer Failed'}
            </Text>
            <Text style={styles.modalSubtitle}>{responseMessage}</Text>
            <TouchableOpacity 
              style={responseSuccess ? styles.confirmBtn : styles.refundBtn} 
              onPress={closeResponseModal}
            >
              <Text style={styles.buttonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Refund Modal */}
      <Modal visible={refundModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '80%' }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Request a Refund</Text>
              
              <Text style={styles.inputLabel}>Select Reason</Text>
              <View style={styles.pickerContainer}>
                {refundReasons.map((reason) => (
                  <TouchableOpacity
                    key={reason}
                    style={[
                      styles.reasonOption,
                      refundReason === reason && styles.selectedReason
                    ]}
                    onPress={() => setRefundReason(reason)}
                  >
                    <Text style={[
                      styles.reasonText,
                      refundReason === reason && styles.selectedReasonText
                    ]}>
                      {reason}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Upload Evidence</Text>
              <TouchableOpacity style={styles.filePickerBtn} onPress={pickDocument}>
                <Text style={styles.filePickerText}>
                  {refundEvidence ? refundEvidence.name : 'Choose File'}
                </Text>
              </TouchableOpacity>

              <Text style={styles.inputLabel}>Additional Comments (Optional)</Text>
              <TextInput
                style={styles.textArea}
                placeholder="Additional comments..."
                value={refundNote}
                onChangeText={setRefundNote}
                multiline
                numberOfLines={4}
              />

              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.refundBtn} onPress={submitRefund}>
                  <Text style={styles.buttonText}>Submit Request</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} onPress={closeRefundModal}>
                  <Text style={styles.buttonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#28a745',
  },
  tabs: {
    flexDirection: 'row',
    justifyContent: 'center',
    backgroundColor: '#f8f9fa',
    padding: 16,
  },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginHorizontal: 8,
    borderRadius: 25,
    backgroundColor: '#e8f5e9',
  },
  activeTab: {
    backgroundColor: '#28a745',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#28a745',
  },
  activeTabText: {
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  transactionCard: {
    backgroundColor: '#fff',
    margin: 10,
    borderRadius: 10,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  transactionContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  productImage: {
    width: 70,
    height: 70,
    borderRadius: 5,
    marginRight: 10,
  },
  transactionDetails: {
    flex: 1,
  },
  productTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 5,
  },
  amount: {
    fontSize: 14,
    color: '#555',
    marginBottom: 5,
  },
  date: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginVertical: 5,
  },
  badgePending: {
    backgroundColor: '#fff3cd',
  },
  badgeReleased: {
    backgroundColor: '#d4edda',
  },
  badgeRefundRequested: {
    backgroundColor: '#f8d7da',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  buttonContainer: {
    marginTop: 10,
  },
  confirmBtn: {
    backgroundColor: '#007bff',
    padding: 8,
    borderRadius: 5,
    marginBottom: 8,
  },
  refundBtn: {
    backgroundColor: '#dc3545',
    padding: 8,
    borderRadius: 5,
    marginBottom: 8,
  },
  cancelBtn: {
    backgroundColor: '#6c757d',
    padding: 8,
    borderRadius: 5,
  },
  disabledBtn: {
    backgroundColor: '#6c757d',
    padding: 8,
    borderRadius: 5,
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  dealUserInfo: {
    marginTop: 12,
  },
  dealUserText: {
    fontSize: 13,
    color: '#495057',
  },
  dealUserName: {
    fontWeight: '500',
  },
  noTransactions: {
    padding: 40,
    alignItems: 'center',
  },
  noTransactionsText: {
    fontSize: 16,
    color: '#6c757d',
    textAlign: 'center',
  },
  skeletonCard: {
    backgroundColor: '#fff',
    margin: 16,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  skeletonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  skeletonImage: {
    width: 75,
    height: 75,
    borderRadius: 12,
    backgroundColor: '#e0e0e0',
    marginRight: 16,
  },
  skeletonDetails: {
    flex: 1,
  },
  skeletonLine: {
    height: 14,
    borderRadius: 8,
    backgroundColor: '#e0e0e0',
    marginBottom: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: 32,
    borderRadius: 16,
    width: '90%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#6c757d',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
    marginTop: 16,
  },
  pickerContainer: {
    marginBottom: 16,
  },
  reasonOption: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    marginBottom: 8,
  },
  selectedReason: {
    borderColor: '#28a745',
    backgroundColor: '#e8f5e9',
  },
  reasonText: {
    fontSize: 14,
    color: '#333',
  },
  selectedReasonText: {
    color: '#28a745',
    fontWeight: '500',
  },
  filePickerBtn: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    marginBottom: 16,
  },
  filePickerText: {
    fontSize: 14,
    color: '#6c757d',
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    height: 80,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
});

export default DealsScreen;