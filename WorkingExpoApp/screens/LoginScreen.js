import React, { useState } from 'react';
import { 
  StyleSheet, 
  View, 
  Alert, 
  TextInput, 
  TouchableOpacity, 
  Text, 
  ActivityIndicator, 
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { jwtDecode } from 'jwt-decode';
import API_BASE_URL from '../config';

export default function LoginScreen({ setIsLoggedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const navigation = useNavigation();

  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleEmailChange = (text) => {
    setEmail(text);
    if (emailError) setEmailError('');
  };

  const handlePasswordChange = (text) => {
    setPassword(text);
    if (passwordError) setPasswordError('');
  };

  const submit = async () => {
    // Reset errors
    setEmailError('');
    setPasswordError('');

    // Validation
    let hasError = false;
    
    if (!email) {
      setEmailError('Email is required');
      hasError = true;
    } else if (!validateEmail(email)) {
      setEmailError('Please enter a valid email address');
      hasError = true;
    }

    if (!password) {
      setPasswordError('Password is required');
      hasError = true;
    } else if (password.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      hasError = true;
    }

    if (hasError) return;

    setIsLoading(true);

    try {
      const response = await fetch('https://salmart.onrender.com/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.toLowerCase().trim(), password }),
      });

      const data = await response.json();

      if (response.ok) {
        // --- THE FIX STARTS HERE ---
        // 1. Get the token from the response
        const token = data.token;
        
        // 2. Decode the token to get the payload (which contains the user ID)
        const decodedToken = jwtDecode(token);
        console.log('Decoded Token:', decodedToken); // <-- Check your console for the user ID property name
        
        // 3. Extract the user ID. The property name might be 'userId', '_id', or 'id'.
        //    Adjust this line based on what you see in the console.
        const userId = decodedToken.userId || decodedToken._id; // <-- Adjust this line

        if (!userId) {
          Alert.alert('Login Error', 'User ID not found in token payload. Please check your token structure.');
          setIsLoading(false);
          return;
        }

        // 4. Save both the token and the extracted user ID
        await AsyncStorage.setItem('token', token);
        await AsyncStorage.setItem('userId', userId);
        
        setIsLoggedIn(true);
        Alert.alert('Success', 'Login successful');
      } else {
        Alert.alert('Error', data.message || 'Invalid credentials');
      }
    } catch (err) {
      console.error('Login Error:', err);
      Alert.alert('Error', 'Network problem. Please try again');
    } finally {
      setIsLoading(false);
    }
  };

  const navigateToRegister = () => {
    navigation.navigate('Register');
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#f9f9f9" />
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header Section */}
          <View style={styles.headerContainer}>
            <View style={styles.logoContainer}>
              <Text style={styles.logo}>S</Text>
            </View>
            <Text style={styles.title}>Salmart</Text>
            <Text style={styles.subtitle}>Sign in to your account</Text>
          </View>

          {/* Form Section */}
          <View style={styles.formContainer}>
            {/* Email Input */}
            <View style={styles.inputContainer}>
              <TextInput
                style={[styles.input, emailError ? styles.inputError : null]}
                placeholder="Enter your email"
                placeholderTextColor="#999"
                value={email}
                onChangeText={handleEmailChange}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isLoading}
              />
              {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
            </View>

            {/* Password Input */}
            <View style={styles.inputContainer}>
              <TextInput
                style={[styles.input, passwordError ? styles.inputError : null]}
                placeholder="Enter your password"
                placeholderTextColor="#999"
                secureTextEntry
                value={password}
                onChangeText={handlePasswordChange}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isLoading}
              />
              {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
            </View>

            {/* Login Button */}
            <TouchableOpacity 
              style={[styles.button, isLoading ? styles.buttonDisabled : null]} 
              onPress={submit} 
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.loadingText}>Signing in...</Text>
                </View>
              ) : (
                <Text style={styles.buttonText}>Sign In</Text>
              )}
            </TouchableOpacity>

            {/* Register Link */}
            <TouchableOpacity onPress={navigateToRegister} style={styles.registerContainer}>
              <Text style={styles.registerText}>
                Don't have an account? 
                <Text style={styles.registerLink}> Register</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9f9f9',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoContainer: {
    marginBottom: 16,
    shadowColor: '#28a745',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  logo: {
    backgroundColor: '#28a745',
    color: '#fff',
    fontSize: 42,
    fontWeight: 'bold',
    paddingVertical: 20,
    paddingHorizontal: 22,
    borderRadius: 12,
    textAlign: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  formContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  inputContainer: {
    marginBottom: 20,
  },
  input: {
    width: '100%',
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#e1e5e9',
    borderRadius: 10,
    backgroundColor: '#fff',
    fontSize: 16,
    color: '#333',
  },
  inputError: {
    borderColor: '#dc3545',
  },
  errorText: {
    color: '#dc3545',
    fontSize: 14,
    marginTop: 6,
    marginLeft: 4,
  },
  button: {
    width: '100%',
    paddingVertical: 16,
    backgroundColor: '#28a745',
    borderRadius: 10,
    marginTop: 8,
    alignItems: 'center',
    shadowColor: '#28a745',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  buttonDisabled: {
    backgroundColor: '#a8d4b8',
    shadowOpacity: 0.1,
    elevation: 2,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 18,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
    marginLeft: 10,
  },
  registerContainer: {
    marginTop: 24,
    alignItems: 'center',
  },
  registerText: {
    fontSize: 16,
    color: '#666',
  },
  registerLink: {
    color: '#28a745',
    fontWeight: '600',
  },
});
