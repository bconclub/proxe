'use client'

import { useState, useEffect } from 'react';
import styles from './DeployModal.module.css';
import { storeUserProfile, getStoredUser } from '@/lib/chatLocalStorage';

interface DeployModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFormSubmit?: () => void;
}

export default function DeployModal({ isOpen, onClose, onFormSubmit }: DeployModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phoneNumber: '',
    websiteUrl: '',
  });

  // Helper to clean phone number (remove +1 prefix if present)
  const cleanPhoneNumber = (phone: string | null | undefined): string => {
    if (!phone) return '';
    // Remove +1 prefix if present
    return phone.replace(/^\+1\s*/, '').trim();
  };

  // Pre-fill form with existing user data when modal opens
  useEffect(() => {
    if (isOpen) {
      const existingUser = getStoredUser('proxe');
      if (existingUser) {
        setFormData({
          name: existingUser.name || '',
          email: existingUser.email || '',
          phoneNumber: cleanPhoneNumber(existingUser.phone),
          websiteUrl: existingUser.websiteUrl || '',
        });
      }
    }
  }, [isOpen]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (!formData.phoneNumber.trim()) {
      newErrors.phoneNumber = 'Phone number is required';
    }

    if (!formData.websiteUrl.trim()) {
      newErrors.websiteUrl = 'Website URL is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));

    console.log('Form submitted:', formData);
    
    // Save user details to profile for both brands
    const userProfile = {
      name: formData.name.trim(),
      email: formData.email.trim(),
      phone: formData.phoneNumber.trim(),
      websiteUrl: formData.websiteUrl.trim(),
      promptedName: true,
      promptedEmail: true,
      promptedPhone: true,
    };
    
    // Store for PROXe brand
    storeUserProfile(userProfile, 'proxe');
    
    setIsSubmitting(false);
    setSubmitSuccess(true);

    // Notify the chat widget about successful submission
    if (onFormSubmit) {
      onFormSubmit();
    }

    // Reset form after success
    setTimeout(() => {
      setFormData({
        name: '',
        email: '',
        phoneNumber: '',
        websiteUrl: '',
      });
      setSubmitSuccess(false);
      onClose();
    }, 2000);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className={styles.modalBackdrop} onClick={handleBackdropClick}>
      <div className={styles.modalContainer}>
        <button 
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close modal"
        >
          ×
        </button>
        
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Deploy PROXe</h2>
        </div>

        {submitSuccess ? (
          <div className={styles.successMessage}>
            <div className={styles.successIcon}>✓</div>
            <h3>Successfully Submitted!</h3>
            <p>We'll be in touch with you shortly to set up your PROXe.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.formGroup}>
              <label htmlFor="name" className={styles.label}>
                Name <span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className={`${styles.input} ${errors.name ? styles.inputError : ''}`}
                placeholder="Your full name"
              />
              {errors.name && <span className={styles.errorText}>{errors.name}</span>}
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="email" className={styles.label}>
                Email <span className={styles.required}>*</span>
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className={`${styles.input} ${errors.email ? styles.inputError : ''}`}
                placeholder="your@email.com"
              />
              {errors.email && <span className={styles.errorText}>{errors.email}</span>}
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="phoneNumber" className={styles.label}>
                Phone Number <span className={styles.required}>*</span>
              </label>
              <input
                type="tel"
                id="phoneNumber"
                name="phoneNumber"
                value={formData.phoneNumber}
                onChange={handleChange}
                className={`${styles.input} ${errors.phoneNumber ? styles.inputError : ''}`}
                placeholder="Enter your phone number"
              />
              {errors.phoneNumber && <span className={styles.errorText}>{errors.phoneNumber}</span>}
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="websiteUrl" className={styles.label}>
                Website URL <span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                id="websiteUrl"
                name="websiteUrl"
                value={formData.websiteUrl}
                onChange={handleChange}
                className={`${styles.input} ${errors.websiteUrl ? styles.inputError : ''}`}
                placeholder="yourwebsite.com"
              />
              {errors.websiteUrl && <span className={styles.errorText}>{errors.websiteUrl}</span>}
            </div>

            <button 
              type="submit" 
              className={styles.submitButton}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Submitting...' : 'Deploy Now'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

