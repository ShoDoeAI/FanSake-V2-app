import React from 'react'
import { useAuth } from '../contexts/CleanAuthContext'

export default function Dashboard() {
  const { user, profile, signOut, isArtist, isFan } = useAuth()

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold">FanSake Dashboard</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-gray-700">{user?.email}</span>
              <button
                onClick={signOut}
                className="text-gray-500 hover:text-gray-700"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Welcome, {profile?.display_name || 'User'}!
              </h2>
              
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  <strong>Email:</strong> {user?.email}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>Username:</strong> {profile?.username}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>Account Type:</strong> {isArtist ? 'Artist' : 'Fan'}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>User ID:</strong> {user?.id}
                </p>
              </div>

              {isArtist && (
                <div className="mt-6 p-4 bg-purple-50 rounded-lg">
                  <h3 className="font-medium text-purple-900">Artist Features</h3>
                  <p className="text-sm text-purple-700 mt-1">
                    Upload content, manage your profile, and connect with fans.
                  </p>
                </div>
              )}

              {isFan && (
                <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                  <h3 className="font-medium text-blue-900">Fan Features</h3>
                  <p className="text-sm text-blue-700 mt-1">
                    Discover artists, follow your favorites, and access exclusive content.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}