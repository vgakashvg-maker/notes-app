package app.notes.android.di

import android.content.Context
import app.notes.android.notifications.AndroidNotificationProvider
import app.notes.domain.NotificationProvider
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object NotificationsModule {
    @Provides
    @Singleton
    fun provideNotificationProvider(
        @ApplicationContext context: Context,
    ): NotificationProvider = AndroidNotificationProvider(context)
}
