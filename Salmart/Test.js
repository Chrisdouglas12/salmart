
import React, { useState } from 'react'
import { View, StyleSheet, Button, TextInput, Text, Alert } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

export default function LoginScreen({navigation}) {
  const [ email, setEmail ] = useState('')
  const [ password, setPassword ] = useState('')
  const [loading  setLoading] = useState(false)
  
  const submit = async => {
    if(!email || !password ) return {
      Alert.alert('invalid email and password ')
      setLoading(true)
      
      try {
        const response = await fetch(`${API_BASE_URL}/login`), {
          method: 'POST',
          headers: {'Content-type:' 'application/json'  },
          body: JSON.strigify({email, password}),
        }
        
      }
    }
  }
  
}